terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # このブートストラップのステートは prod 本体とは分離する。
  # 必要なら S3 バックエンドに移行してよい（backend.tf.example を参照）。
}
