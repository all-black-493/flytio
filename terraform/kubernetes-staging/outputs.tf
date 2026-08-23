output "eks_cluster_name" {
  description = "Name of the staging EKS Auto Mode cluster."
  value       = aws_eks_cluster.staging.name
}

output "ecr_repository_url" {
  description = "ECR repository used for backend images."
  value       = aws_ecr_repository.backend.repository_url
}

output "redis_primary_endpoint" {
  description = "TLS-enabled Redis endpoint used by staging workloads."
  value       = aws_elasticache_replication_group.staging.primary_endpoint_address
}

output "github_actions_deploy_role_arn" {
  description = "Role assumed by the staging deployment workflow."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "github_actions_plan_role_arn" {
  description = "Read-only role assumed by pull_request plan runs."
  value       = aws_iam_role.github_actions_plan.arn
}


output "acm_certificate_arn" {
  description = "Certificate the staging ALB terminates TLS with."
  value       = aws_acm_certificate.api.arn
}

output "acm_validation_record" {
  description = "CNAME to create in Cloudflare so the certificate can be issued. Until it exists the certificate stays PENDING_VALIDATION and the Ingress cannot attach it."
  value = [
    for option in aws_acm_certificate.api.domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ]
}

output "vpc_cidr_block" {
  description = "Range uvicorn trusts X-Forwarded-For from, so the API sees real client IPs rather than the ALB's."
  value       = data.aws_vpc.default.cidr_block
}
