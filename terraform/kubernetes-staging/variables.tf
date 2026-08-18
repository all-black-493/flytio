variable "aws_region" {
  description = "AWS region for the staging Kubernetes platform."
  type        = string
  default     = "us-east-2"
}

variable "project_name" {
  description = "Short name used for backend infrastructure."
  type        = string
  default     = "flyt-backend"
}

variable "environment" {
  description = "Environment represented by this Terraform root."
  type        = string
  default     = "staging"
}

variable "github_repository" {
  description = "GitHub repository allowed to deploy the backend."
  type        = string
  default     = "all-black-493/flytio"
}

# GitHub now signs its OIDC tokens with IMMUTABLE ids baked into the
# subject: "owner@ownerId/repo@repoId" rather than "owner/repo". The point
# is that renaming a repository cannot hand its cloud access to whoever
# claims the old name.
#
# Nothing in the error tells you this - a trust policy written the classic
# way fails with a bare "Not authorized to perform
# sts:AssumeRoleWithWebIdentity". The value below was read out of
# CloudTrail, which logs the subject actually presented:
#
#   aws cloudtrail lookup-events \
#     --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity
#
# Left empty, only the classic subjects are trusted - correct for an
# account that has not enabled immutable subjects.
variable "github_repository_immutable" {
  description = "Repository in GitHub's immutable OIDC subject form, owner@ownerId/repo@repoId. Empty to trust only the classic form."
  type        = string
  default     = "all-black-493@211421073/flytio@1301496225"
}

variable "kubernetes_namespace" {
  description = "Kubernetes namespace GitHub Actions may deploy into."
  type        = string
  default     = "flyt-staging"
}