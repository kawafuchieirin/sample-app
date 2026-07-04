variable "table_name" {
  description = "DynamoDB テーブル名"
  type        = string
}

variable "tags" {
  description = "リソースに付与するタグ"
  type        = map(string)
  default     = {}
}
