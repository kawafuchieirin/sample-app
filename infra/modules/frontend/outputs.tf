output "bucket_name" {
  description = "S3 バケット名"
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront ディストリビューション ID（prod のみ）"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.cdn[0].id : null
}

output "site_url" {
  description = "サイトの URL"
  value = var.enable_cloudfront ? (
    "https://${aws_cloudfront_distribution.cdn[0].domain_name}"
    ) : (
    "http://${aws_s3_bucket.site.bucket}.s3-website.localhost.localstack.cloud:4566"
  )
}
