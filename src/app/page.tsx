"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  TypographyH1,
  TypographyMuted,
} from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { SettingsToggles } from "@/feature/settings";
import type { Project } from "@/lib/forma";

function formatDate(createdAt: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(createdAt.replace(" ", "T") + "Z"),
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const api = typeof window === "undefined" ? undefined : window.forma;

  useEffect(() => {
    window.forma?.projects.list().then(setProjects);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!api || !name.trim()) return;
    const project = await api.projects.create(name);
    setProjects((p) => [project, ...p]);
    setName("");
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem", display: "grid", gap: "1.5rem" }}>
      <header style={{ display: "grid", gap: "0.75rem" }}>
        <TypographyH1>Forma</TypographyH1>
        <TypographyMuted>{t("app.tagline")}</TypographyMuted>
        <SettingsToggles />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("projects.newTitle")}</CardTitle>
          <CardDescription>{t("projects.newDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} style={{ display: "flex", gap: "0.5rem" }}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects.namePlaceholder")}
              maxLength={120}
              aria-label={t("projects.nameLabel")}
            />
            <Button type="submit" disabled={!api}>
              {t("projects.create")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {projects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("projects.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("projects.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup>
          {projects.map((p) => (
            <Item key={p.id}>
              <ItemContent>
                <ItemTitle>{p.name}</ItemTitle>
                <ItemDescription>{formatDate(p.createdAt, i18n.language)}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </main>
  );
}
