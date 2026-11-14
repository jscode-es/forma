"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Icon,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@kivora/nextjs";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProjectSummary } from "@/lib/forma";
import { useProjectStore } from "@/stores/project-store";
import { openProject, useProjectFlow } from "../project-flow";

export function LibraryDialogContent({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const currentId = useProjectStore((s) => s.id);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setProjects((await window.forma?.projects.list()) ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    window.forma?.projects.list().then((list) => active && setProjects(list));
    return () => {
      active = false;
    };
  }, []);

  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      await refresh();
    } catch (error) {
      useProjectFlow.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function commitRename() {
    if (!renaming) return;
    const name = renaming.name.trim();
    setRenaming(null);
    if (!name || name.length > 120) return;
    await act(async () => {
      const updated = await window.forma!.projects.rename(renaming.id, name);
      if (updated.id === useProjectStore.getState().id) useProjectStore.getState().setName(updated.name);
    });
  }

  async function confirmDelete(id: string) {
    setDeleting(null);
    await act(async () => {
      await window.forma!.projects.delete(id);
      if (id === useProjectStore.getState().id) useProjectStore.getState().newProject();
    });
  }

  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  return (
    <DialogContent style={{ maxWidth: "40rem" }}>
      <DialogHeader>
        <DialogTitle>{t("library.title")}</DialogTitle>
        <DialogDescription>{t("library.description")}</DialogDescription>
      </DialogHeader>

      {projects?.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("library.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("library.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {projects && projects.length > 0 && (
        <ItemGroup style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {projects.map((p) => (
            <Item key={p.id} variant="outline">
              <ItemContent>
                {renaming?.id === p.id ? (
                  <Input
                    value={renaming.name}
                    maxLength={120}
                    autoFocus
                    aria-label={t("project.name")}
                    onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setRenaming(null);
                      }
                    }}
                  />
                ) : (
                  <ItemTitle>
                    {p.name}
                    {p.id === currentId && <Badge variant="secondary">{t("library.current")}</Badge>}
                  </ItemTitle>
                )}
                <ItemDescription>{t("library.updated", { date: format.format(new Date(p.updatedAt)) })}</ItemDescription>
              </ItemContent>
              <ItemActions>
                {deleting === p.id ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => confirmDelete(p.id)}>
                      {t("library.confirmDelete")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("library.rename")}
                      title={t("library.rename")}
                      onClick={() => setRenaming({ id: p.id, name: p.name })}
                    >
                      <Icon icon={Pencil} size={15} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("library.duplicate")}
                      title={t("library.duplicate")}
                      onClick={() =>
                        act(() => window.forma!.projects.duplicate(p.id, t("library.copyName", { name: p.name }).slice(0, 120)))
                      }
                    >
                      <Icon icon={Copy} size={15} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("library.delete")}
                      title={t("library.delete")}
                      onClick={() => setDeleting(p.id)}
                    >
                      <Icon icon={Trash2} size={15} />
                    </Button>
                    <Button
                      size="sm"
                      disabled={p.id === currentId}
                      onClick={() => {
                        onClose();
                        openProject(p.id);
                      }}
                    >
                      {t("library.open")}
                    </Button>
                  </>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </DialogContent>
  );
}
