terraform {
  /*
  cloud {
    organization = "Flyt_io"

    workspaces {
      project = "Backend"
      name = "flyt_io"
    }
  }
  */

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.92"
    }
  }

  backend "s3" {
    bucket       = "flyt-africa-terraform-state-bucket"
    key          = "prod/terraform.tfstate"
    region       = "us-east-2"
    use_lockfile = true
    encrypt      = true

  }

  required_version = ">= 1.2.0"
}
