output "deploy_role_arn" {
  description = "GitHub Actions が引き受けるデプロイ用 IAM ロールの ARN。リポジトリ変数 AWS_DEPLOY_ROLE_ARN に設定する。"
  value       = aws_iam_role.deploy.arn
}

output "oidc_provider_arn" {
  description = "GitHub OIDC プロバイダの ARN"
  value       = local.oidc_provider_arn
}

output "set_github_variable_command" {
  description = "リポジトリ変数を設定する gh コマンド例"
  value       = "gh variable set AWS_DEPLOY_ROLE_ARN --repo ${var.github_repo} --body ${aws_iam_role.deploy.arn}"
}
