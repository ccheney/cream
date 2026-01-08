# Output values
#
# These values are displayed after `tofu apply` and can be used
# in scripts via `tofu output -raw <name>`.

output "server_ip" {
  description = "Public IPv4 address of the Cream server"
  value       = hcloud_server.cream.ipv4_address
}

output "server_ipv6" {
  description = "Public IPv6 address of the Cream server"
  value       = hcloud_server.cream.ipv6_address
}

output "server_status" {
  description = "Current status of the server"
  value       = hcloud_server.cream.status
}

output "dashboard_url" {
  description = "URL for the Cream dashboard"
  value       = "https://${var.domain}"
}

output "api_url" {
  description = "URL for the Cream API"
  value       = "https://api.${var.domain}"
}

output "ssh_command" {
  description = "SSH command to connect to the server"
  value       = "ssh ${var.deploy_user}@${hcloud_server.cream.ipv4_address}"
}

output "deploy_command" {
  description = "Command to deploy Cream to the server"
  value       = "ssh ${var.deploy_user}@${hcloud_server.cream.ipv4_address} 'cd ~/cream && ./scripts/deploy.sh'"
}
