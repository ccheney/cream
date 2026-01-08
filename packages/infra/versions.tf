# OpenTofu version constraints
#
# This module requires OpenTofu (Terraform-compatible) and the Hetzner Cloud
# and Vercel providers for infrastructure provisioning.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.49"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 2.0"
    }
  }
}
