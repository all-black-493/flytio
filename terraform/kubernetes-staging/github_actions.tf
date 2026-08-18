data "aws_caller_identity" "current" {}

locals {
  github_oidc_provider_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"

  # Both subject forms, because which one GitHub sends is its choice, not
  # ours - see var.github_repository_immutable. Trusting both means the
  # role keeps working whether or not immutable subjects are enabled, and
  # across the switch either way.
  #
  # Each entry names this exact repository. No wildcard on the repo
  # segment: "repo:owner/*" would trust every repository the account owns,
  # including one created by anyone who gains write access.
  github_oidc_subjects = concat(
    [
      "repo:${var.github_repository}:ref:refs/heads/main",
      "repo:${var.github_repository}:environment:${var.environment}",
    ],
    var.github_repository_immutable == "" ? [] : [
      "repo:${var.github_repository_immutable}:ref:refs/heads/main",
      "repo:${var.github_repository_immutable}:environment:${var.environment}",
    ],
  )
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_oidc_subjects
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${local.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid       = "AuthenticateToECR"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PushAndReadBackendImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  statement {
    sid       = "DescribeStagingCluster"
    actions   = ["eks:DescribeCluster"]
    resources = [aws_eks_cluster.staging.arn]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "${local.name}-deploy"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}

resource "aws_eks_access_entry" "github_actions_deploy" {
  cluster_name  = aws_eks_cluster.staging.name
  principal_arn = aws_iam_role.github_actions_deploy.arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "github_actions_deploy" {
  cluster_name  = aws_eks_cluster.staging.name
  principal_arn = aws_iam_role.github_actions_deploy.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"

  access_scope {
    type       = "namespace"
    namespaces = [var.kubernetes_namespace]
  }

  depends_on = [aws_eks_access_entry.github_actions_deploy]
}