# Changelog

## [1.4.1](https://github.com/kawafuchieirin/sample-app/compare/v1.4.0...v1.4.1) (2026-07-05)


### Bug Fixes

* **frontend:** AI アシスタントパネルを opt-in 化し本番の壊れた接続表示を解消 ([88ad0ae](https://github.com/kawafuchieirin/sample-app/commit/88ad0aef5e669a7f16de6372d1db02f61e8f43d9))
* **frontend:** AI パネルを opt-in 化し本番の壊れた接続表示を解消 ([466fd84](https://github.com/kawafuchieirin/sample-app/commit/466fd8495c1cb136b6598033372c05e15415973c))

## [1.4.0](https://github.com/kawafuchieirin/sample-app/compare/v1.3.0...v1.4.0) (2026-07-05)


### Features

* AI タスクアシスタント (Codex app-server ベース) を追加 ([90c85a2](https://github.com/kawafuchieirin/sample-app/commit/90c85a2bdd570646730f97310b4d7cd0768b7d6c))
* Codex app-server ベースの AI ゲートウェイを追加 ([aed1463](https://github.com/kawafuchieirin/sample-app/commit/aed1463a85b3901c99e0f31f3118b0c7c323600c))
* タスク一覧に AI アシスタントパネルを統合 ([3564ea5](https://github.com/kawafuchieirin/sample-app/commit/3564ea532428545f993c870df29c0c5a67e28d28))
* ローカル API サーバと ai-gateway 起動スクリプトを追加 ([5eccc2c](https://github.com/kawafuchieirin/sample-app/commit/5eccc2c8c6fff3a5cd36a435765586331d38ce40))

## [1.3.0](https://github.com/kawafuchieirin/sample-app/compare/v1.2.0...v1.3.0) (2026-07-05)


### Features

* prod の Terraform ステートを S3 リモートバックエンド化 ([1e2fda5](https://github.com/kawafuchieirin/sample-app/commit/1e2fda5e20399a7e36881de498426e66bf1cd558))
* prod の Terraform ステートを S3 リモートバックエンド化 ([d0ff054](https://github.com/kawafuchieirin/sample-app/commit/d0ff0549929632e0b9b53d21d30573b6ead24435))

## [1.2.0](https://github.com/kawafuchieirin/sample-app/compare/v1.1.0...v1.2.0) (2026-07-04)


### Features

* タスク統計API (GET /stats) を api/ に追加 ([6805564](https://github.com/kawafuchieirin/sample-app/commit/6805564e7c4eccd6d60deb753734456aef0453ef))

## [1.1.0](https://github.com/kawafuchieirin/sample-app/compare/v1.0.0...v1.1.0) (2026-07-04)


### Features

* GitHub OIDC デプロイ用の Terraform ブートストラップを追加 ([b1856cf](https://github.com/kawafuchieirin/sample-app/commit/b1856cfd4a759cddfd9a119ff7e643958e04fb6a))
* GitHub OIDC デプロイ用の Terraform ブートストラップを追加 ([f1ec6fe](https://github.com/kawafuchieirin/sample-app/commit/f1ec6fe1f30f69b122c21451307ac4b201292b24))
* タスク管理アプリ(React+Lambda+DynamoDB)をTerraform/CI-CD付きで追加 ([70d6298](https://github.com/kawafuchieirin/sample-app/commit/70d6298c0f43eb81a322021624302d5146a2ae21))
* タスク管理アプリ(React+Lambda+DynamoDB)をTerraform/CI-CD付きで追加 ([9f55690](https://github.com/kawafuchieirin/sample-app/commit/9f55690fd60956dcfc94f0114fe360036701db1b))

## 1.0.0 (2026-07-04)


### Features

* release-pleaseによるリリース自動作成ワークフローを追加（PR [#1](https://github.com/kawafuchieirin/sample-app/issues/1)の取りこぼし分） ([97a814d](https://github.com/kawafuchieirin/sample-app/commit/97a814d9b8f0d963599281d65d02006fa0c74497))
* release-pleaseによるリリース自動化に変更 ([9d26bda](https://github.com/kawafuchieirin/sample-app/commit/9d26bda80f6518a26dc3fbd39b71748d8692e012))
* リリース自動作成のGitHub Actionsワークフローを追加 ([48af9fe](https://github.com/kawafuchieirin/sample-app/commit/48af9fe7bf0302e5196c0241a7b42f8c1867f16b))
* リリース自動作成のGitHub Actionsワークフローを追加 ([697801e](https://github.com/kawafuchieirin/sample-app/commit/697801e5e101672b9a30c7b8a4b7f093992e4170))
