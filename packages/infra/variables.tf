# Input variables for Cream infrastructure
#
# Set these via environment variables (TF_VAR_*) or terraform.tfvars

# Hetzner Cloud
variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "server_name" {
  description = "Name of the server"
  type        = string
  default     = "cream-prod"
}

variable "server_type" {
  description = "Hetzner server type (cpx31 = 4 vCPU, 8 GB RAM)"
  type        = string
  default     = "cpx31"
}

variable "server_location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "ash" # Ashburn, Virginia
}

variable "server_image" {
  description = "OS image for the server"
  type        = string
  default     = "ubuntu-24.04"
}

# SSH
variable "ssh_public_key_path" {
  description = "Path to SSH public key file"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "ssh_key_name" {
  description = "Name for the SSH key in Hetzner"
  type        = string
  default     = "cream-deploy"
}

# Vercel DNS
variable "vercel_api_token" {
  description = "Vercel API token for DNS management"
  type        = string
  sensitive   = true
}

variable "vercel_team_id" {
  description = "Vercel team ID (optional)"
  type        = string
  default     = null
}

variable "domain" {
  description = "Root domain for the application"
  type        = string
  default     = "cream.broker"
}

# User configuration
variable "deploy_user" {
  description = "Non-root user for deployments"
  type        = string
  default     = "cream"
}
