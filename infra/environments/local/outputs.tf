output "api_endpoint" {
  description = "API のベース URL"
  value       = module.backend.api_endpoint
}

output "api_id" {
  description = "API Gateway の ID（LocalStack ではローカル URL 組み立てに使用）"
  value       = module.backend.api_id
}

output "frontend_bucket" {
  description = "フロントエンド用 S3 バケット名"
  value       = module.frontend.bucket_name
}

output "site_url" {
  description = "サイト URL"
  value       = module.frontend.site_url
}

output "table_name" {
  description = "DynamoDB テーブル名"
  value       = module.database.table_name
}
