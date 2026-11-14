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
import type { Project } from "@/lib/forma";

export default function Home() {
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
      <header>
        <TypographyH1>Forma</TypographyH1>
        <TypographyMuted>Local-first AI studio: 3D models, rigging, animation and painting.</TypographyMuted>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
          <CardDescription>Projects are stored locally in SQLite.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} style={{ display: "flex", gap: "0.5rem" }}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              maxLength={120}
              aria-label="Project name"
            />
            <Button type="submit" disabled={!api}>
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      {projects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>Create your first project to start generating.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup>
          {projects.map((p) => (
            <Item key={p.id}>
              <ItemContent>
                <ItemTitle>{p.name}</ItemTitle>
                <ItemDescription>{p.createdAt}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </main>
  );
}
