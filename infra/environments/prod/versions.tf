terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # 本番のステートはチーム共有のため S3 バックエンドを推奨。
  # 事前に S3 バケット + DynamoDB(ロック用) を用意し、backend.tf.example を参照して有効化する。
}
