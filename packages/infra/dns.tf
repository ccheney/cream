# Vercel DNS records for cream.broker
#
# Creates A records pointing to the Hetzner server IP.
# Caddy handles path-based routing on the server.

# Root domain A record (cream.broker)
resource "vercel_dns_record" "root" {
  domain = var.domain
  name   = "" # Root domain
  type   = "A"
  ttl    = 300
  value  = hcloud_server.cream.ipv4_address
}

# API subdomain A record (api.cream.broker)
resource "vercel_dns_record" "api" {
  domain = var.domain
  name   = "api"
  type   = "A"
  ttl    = 300
  value  = hcloud_server.cream.ipv4_address
}

# Optional: www subdomain CNAME
resource "vercel_dns_record" "www" {
  domain = var.domain
  name   = "www"
  type   = "CNAME"
  ttl    = 300
  value  = "${var.domain}."
}

# CAA record for Let's Encrypt
resource "vercel_dns_record" "caa" {
  domain = var.domain
  name   = ""
  type   = "CAA"
  ttl    = 3600
  value  = "0 issue \"letsencrypt.org\""
}
