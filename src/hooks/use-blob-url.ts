import { useEffect, useState } from "react";

export function useBlobUrl(key: string | null, load: () => Promise<Uint8Array> | undefined, type = "image/png") {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    let active = true;
    let created: string | null = null;
    load()
      ?.then((bytes) => {
        if (!active) return;
        created = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
        setUrl(created);
      })
      .catch(() => active && setUrl(null));
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return key ? url : null;
}
