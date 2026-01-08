# SSH key resource for server access
#
# Uploads the local SSH public key to Hetzner Cloud

resource "hcloud_ssh_key" "deploy" {
  name       = var.ssh_key_name
  public_key = file(pathexpand(var.ssh_public_key_path))
}
