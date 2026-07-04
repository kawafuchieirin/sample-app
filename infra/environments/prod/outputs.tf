output "api_endpoint" {
  description = "API のベース URL"
  value       = module.backend.api_endpoint
}

output "lambda_function_name" {
  description = "Lambda 関数名（CD でのコード更新に使用）"
  value       = module.backend.function_name
}

output "frontend_bucket" {
  description = "フロントエンド用 S3 バケット名"
  value       = module.frontend.bucket_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront ディストリビューション ID（キャッシュ無効化に使用）"
  value       = module.frontend.cloudfront_distribution_id
}

output "site_url" {
  description = "サイト URL"
  value       = module.frontend.site_url
}
