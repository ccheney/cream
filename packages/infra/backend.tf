# Terraform state backend
#
# Uses local state by default. For team collaboration, consider:
# - Terraform Cloud
# - S3 + DynamoDB
# - HTTP backend

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}

# Example: HTTP backend (uncomment to use)
# terraform {
#   backend "http" {
#     address        = "https://api.cream.broker/terraform/state"
#     lock_address   = "https://api.cream.broker/terraform/lock"
#     unlock_address = "https://api.cream.broker/terraform/unlock"
#   }
# }
