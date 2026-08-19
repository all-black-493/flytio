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
  # The backend block in terraform.tf cannot take variables, so these
  # repeat it and must stay in step with it.
  terraform_state_bucket = "flyt-africa-terraform-state-bucket"
  terraform_state_key    = "staging/kubernetes.tfstate"

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

# --- Plan role --------------------------------------------------------
# A pull_request run presents sub "repo:OWNER/REPO:pull_request". That is
# not a ref: subject at all, so it matches none of github_oidc_subjects
# above and the run dies at AssumeRoleWithWebIdentity before it can plan
# anything - which is what every PR touching this directory would do.
#
# A separate role, rather than a pull_request entry on the roles above,
# because a pull_request workflow runs the PULL REQUEST'S OWN copy of the
# workflow file. Trusting that subject on a role that can create IAM
# roles and EKS clusters would let any branch rewrite the job and spend
# those credentials, which is the thing the no-wildcard rule above exists
# to prevent. This role reads, and writes exactly one object.
data "aws_iam_policy_document" "github_actions_plan_assume_role" {
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

    # StringEquals, not StringLike: these are exact strings with nothing
    # to glob, and the pull_request subject carries no branch name to
    # constrain - the workflow's own fork guard is what keeps this to
    # branches inside the repository.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = compact([
        "repo:${var.github_repository}:pull_request",
        var.github_repository_immutable == "" ? "" : "repo:${var.github_repository_immutable}:pull_request",
      ])
    }
  }
}

resource "aws_iam_role" "github_actions_plan" {
  name               = "${local.name}-github-plan"
  assume_role_policy = data.aws_iam_policy_document.github_actions_plan_assume_role.json
  tags               = local.common_tags
}

# Broad read, because `plan` refreshes every resource in the stack and a
# hand-written allow-list would fail on whatever this configuration grows
# next. Read is the ceiling: nothing here can create, modify or delete.
resource "aws_iam_role_policy_attachment" "github_actions_plan_readonly" {
  role       = aws_iam_role.github_actions_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# ReadOnlyAccess already covers reading the state object. What it does not
# cover is holding the lock: use_lockfile writes <key>.tflock beside the
# state for the length of the run, so without this a plan stops at "Error
# acquiring the state lock" having done nothing.
data "aws_iam_policy_document" "github_actions_plan" {
  statement {
    sid       = "HoldTheStateLock"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${local.terraform_state_bucket}/${local.terraform_state_key}.tflock"]
  }
}

resource "aws_iam_role_policy" "github_actions_plan" {
  name   = "${local.name}-plan"
  role   = aws_iam_role.github_actions_plan.id
  policy = data.aws_iam_policy_document.github_actions_plan.json
}
