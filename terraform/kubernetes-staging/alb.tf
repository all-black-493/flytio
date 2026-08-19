# Public ingress for the staging API: an Application Load Balancer, driven
# by a Kubernetes Ingress.
#
# There is no AWS Load Balancer Controller to install. EKS Auto Mode ships
# an ALB controller in the cluster itself, switched on by
# kubernetes_network_config.elastic_load_balancing in eks.tf. What it needs
# from this side is two things: subnets it can discover, and a certificate
# it can attach. The IngressClass that binds it to the chart's Ingress is a
# Kubernetes object, not an AWS one - see k8s/staging/ingress-class.yaml.

# The controller finds subnets for an internet-facing ALB by tag, and the
# default VPC's subnets carry no Kubernetes tags at all - an Ingress in an
# untagged VPC fails with "unable to discover at least one subnet" and no
# load balancer is created.
#
# aws_ec2_tag rather than tags on an aws_subnet resource, because these
# subnets are read with a data source: they belong to the default VPC and
# are shared with everything else in the account, so this adds one tag and
# claims ownership of nothing else.
resource "aws_ec2_tag" "subnet_elb_role" {
  for_each = toset(data.aws_subnets.default.ids)

  resource_id = each.value
  key         = "kubernetes.io/role/elb"
  value       = "1"
}

# TLS terminates at the ALB. Requested here rather than fetched by hand so
# that the ARN the deploy needs is a Terraform output rather than a value
# someone remembers to paste.
#
# DNS validation, and flyt.africa is on Cloudflare rather than Route 53, so
# nothing here can complete the validation - the record has to be added by
# hand, once, from the acm_validation_record output. Deliberately NOT
# wrapped in aws_acm_certificate_validation: that resource blocks the apply
# until the record exists, which would hold an EKS apply open waiting on a
# browser tab.
resource "aws_acm_certificate" "api" {
  domain_name       = var.api_hostname
  validation_method = "DNS"

  tags = merge(local.common_tags, { Name = var.api_hostname })

  # The ALB references this by ARN. Replacing a certificate in place would
  # leave the listener pointing at an ARN that no longer exists.
  lifecycle {
    create_before_destroy = true
  }
}
