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

  required_version = ">= 1.2.0"
}
