data "aws_caller_identity" "current" {}

locals {
  oidc_url  = "token.actions.githubusercontent.com"
  role_name = "${var.project}-github-deploy"

  # allowed_subjects が未指定なら github_repo から自動生成する。
  # deploy.yml は environment: production を使うため environment 形式を許可し、
  # 手動実行など ref ベースも許可する。
  default_subjects = [
    "repo:${var.github_repo}:environment:production",
    "repo:${var.github_repo}:ref:refs/heads/main",
  ]
  allowed_subjects = var.allowed_subjects != null ? var.allowed_subjects : local.default_subjects
}

# GitHub OIDC の TLS 証明書からサムプリントを取得（ハードコードを避ける）
data "tls_certificate" "github" {
  count = var.create_oidc_provider ? 1 : 0
  url   = "https://${local.oidc_url}/.well-known/openid-configuration"
}

# --- OIDC プロバイダ（新規作成 または 既存参照） ---
resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_oidc_provider ? 1 : 0
  url             = "https://${local.oidc_url}"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github[0].certificates[0].sha1_fingerprint]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://${local.oidc_url}"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

# --- 引き受けポリシー（このリポジトリの特定 sub のみ許可） ---
data "aws_iam_policy_document" "assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "${local.oidc_url}:sub"
      values   = local.allowed_subjects
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = local.role_name
  assume_role_policy   = data.aws_iam_policy_document.assume.json
  max_session_duration = 3600
}

# --- デプロイに必要な権限 ---
# terraform apply が扱う各サービス（DynamoDB / Lambda / API Gateway / S3 /
# CloudFront / Logs）と、Lambda 実行ロール管理のための IAM 権限を付与する。
# 運用が固まったらリソース ARN でさらに絞り込める。
data "aws_iam_policy_document" "deploy" {
  statement {
    sid    = "ServiceManagement"
    effect = "Allow"
    actions = [
      "dynamodb:*",
      "lambda:*",
      "apigateway:*",
      "s3:*",
      "cloudfront:*",
      "logs:*",
    ]
    resources = ["*"]
  }

  # Lambda 実行ロールの作成/管理。ロール名を本プロジェクトのパターンに限定する。
  statement {
    sid    = "IamRoleManagement"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:GetRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project}-*"]
  }

  # Lambda にロールを渡す（PassRole）。
  statement {
    sid       = "IamPassRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${local.role_name}-policy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
