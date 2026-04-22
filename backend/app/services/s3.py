from typing import Any


def generate_presigned_upload_url(
    s3_client: Any, bucket_name: str, key: str, expiration: int = 3600
) -> str:
    return s3_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket_name, "Key": key},
        ExpiresIn=expiration,
    )


def generate_presigned_download_url(
    s3_client: Any, bucket_name: str, key: str, expiration: int = 3600
) -> str:
    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket_name, "Key": key},
        ExpiresIn=expiration,
    )
