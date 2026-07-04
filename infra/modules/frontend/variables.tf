variable "bucket_name" {
  description = "静的サイトを配置する S3 バケット名（グローバル一意）"
  type        = string
}

variable "enable_cloudfront" {
  description = <<-EOT
    CloudFront を作成するか。
    prod では true（プライベート S3 + OAC）。
    LocalStack では CloudFront 非対応のため false（S3 ウェブサイトホスティングを直接利用）。
  EOT
  type        = bool
  default     = true
}

variable "index_document" {
  description = "インデックスドキュメント"
  type        = string
  default     = "index.html"
}

variable "tags" {
  description = "リソースに付与するタグ"
  type        = map(string)
  default     = {}
}
