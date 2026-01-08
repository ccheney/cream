# Hetzner Cloud server provisioning
#
# Creates a VPS with Docker and Docker Compose pre-installed via cloud-init.
# The server is ready for Cream deployment after provisioning.

resource "hcloud_server" "cream" {
  name         = var.server_name
  image        = var.server_image
  server_type  = var.server_type
  location     = var.server_location
  ssh_keys     = [hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.cream.id]

  user_data = <<-EOF
    #cloud-config

    # Create deploy user with sudo access
    users:
      - name: ${var.deploy_user}
        groups: sudo, docker
        shell: /bin/bash
        sudo: ALL=(ALL) NOPASSWD:ALL
        ssh_authorized_keys:
          - ${file(pathexpand(var.ssh_public_key_path))}

    # Install packages
    package_update: true
    package_upgrade: true
    packages:
      - apt-transport-https
      - ca-certificates
      - curl
      - gnupg
      - lsb-release
      - git
      - unzip
      - htop
      - fail2ban

    # Install Docker
    runcmd:
      # Add Docker GPG key
      - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

      # Add Docker repository
      - echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list

      # Install Docker Engine
      - apt-get update
      - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

      # Start Docker
      - systemctl enable docker
      - systemctl start docker

      # Add deploy user to docker group
      - usermod -aG docker ${var.deploy_user}

      # Create app directory
      - mkdir -p /home/${var.deploy_user}/cream
      - chown -R ${var.deploy_user}:${var.deploy_user} /home/${var.deploy_user}/cream

      # Configure fail2ban
      - systemctl enable fail2ban
      - systemctl start fail2ban

      # Enable automatic security updates
      - apt-get install -y unattended-upgrades
      - dpkg-reconfigure -plow unattended-upgrades

    # Final message
    final_message: "Cream server ready after $UPTIME seconds"
  EOF

  labels = {
    environment = "production"
    project     = "cream"
    managed_by  = "opentofu"
  }

  lifecycle {
    ignore_changes = [
      ssh_keys, # Prevent recreation if SSH keys change
    ]
  }
}
