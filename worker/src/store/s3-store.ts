import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { objectKey, type ObjectStore, type StoredHead } from "./store";

export type S3Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

const HTML_TYPE = "text/html; charset=utf-8";

export function readS3Config(env: {
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
}): S3Config | null {
  const endpoint = env.S3_ENDPOINT?.trim();
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  const region = env.S3_REGION?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !region) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

function storedId(metadata: Record<string, string> | undefined): string | null {
  const id = metadata?.id;
  return id && id.length > 0 ? id : null;
}

export function createS3Store(config: S3Config): ObjectStore {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const bucket = config.bucket;

  async function readHead(organizationId: string, name: string): Promise<StoredHead | null> {
    try {
      const result = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: objectKey(organizationId, name) }),
      );
      return {
        name,
        id: storedId(result.Metadata),
        updatedAt: result.LastModified ?? new Date(),
        bytes: result.ContentLength ?? 0,
        contentType: result.ContentType ?? HTML_TYPE,
      };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  return {
    async get(organizationId, name) {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: objectKey(organizationId, name) }),
        );
        const body = (await result.Body?.transformToString()) ?? "";
        return {
          name,
          id: storedId(result.Metadata),
          updatedAt: result.LastModified ?? new Date(),
          bytes: result.ContentLength ?? new TextEncoder().encode(body).byteLength,
          contentType: result.ContentType ?? HTML_TYPE,
          body,
        };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    head: readHead,
    async put(organizationId, name, body, meta) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(organizationId, name),
          Body: body,
          ContentType: HTML_TYPE,
          CacheControl: "no-cache",
          Metadata: { id: meta.id },
        }),
      );
      const bytes = new TextEncoder().encode(body).byteLength;
      return { updatedAt: new Date(), bytes };
    },
    async delete(organizationId, name) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(organizationId, name) }),
      );
    },
    async list(organizationId) {
      const prefix = `${organizationId}/`;
      const heads: StoredHead[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        const keys = (page.Contents ?? [])
          .map((item) => item.Key)
          .filter((key): key is string => Boolean(key && key.length > prefix.length));
        const resolved = await Promise.all(
          keys.map(async (key) => {
            const name = key.slice(prefix.length);
            if (name.includes("/")) return null;
            return readHead(organizationId, name);
          }),
        );
        for (const head of resolved) {
          if (head) heads.push(head);
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return heads;
    },
    async copy(organizationId, from, to) {
      const sourceKey = objectKey(organizationId, from);
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: objectKey(organizationId, to),
          CopySource: `${bucket}/${sourceKey}`,
          MetadataDirective: "COPY",
        }),
      );
      const copied = await readHead(organizationId, to);
      if (!copied) throw new Error("Copied object is missing.");
      return copied;
    },
  };
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const status = "$metadata" in error ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode : 0;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}
