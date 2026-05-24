"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FileSearch, FileText } from "lucide-react"
import { FileUploadSection } from "./file-upload-section"
import { CleanupStorageButton } from "@/components/cleanup-storage-button"

export function SearchTool() {
  const [activeMenu, setActiveMenu] = useState<"home" | "search">("home")

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-600">
              <FileText className="size-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-none text-foreground">PDF Search</h1>
              <p className="text-xs text-muted-foreground">Document Analysis Tool</p>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            {activeMenu === "search" && <CleanupStorageButton />}
            {activeMenu === "search" && (
              <Button
                variant="ghost"
                onClick={() => setActiveMenu("home")}
                size="sm"
                className="hover:bg-indigo-50 hover:text-indigo-700"
              >
                Home
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {activeMenu === "home" ? (
          <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
            <Card className="w-full max-w-2xl">
              <CardContent className="p-12 text-center">
                <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-indigo-100">
                  <FileSearch className="size-10 text-indigo-600" />
                </div>
                <h2 className="mb-3 text-3xl font-semibold text-foreground">Welcome to PDF Search</h2>
                <p className="mb-8 text-base leading-relaxed text-muted-foreground">
                  Upload PDF files and search for specific keywords. Extract relevant paragraphs with metadata and
                  export results to Word documents instantly.
                </p>
                <Button
                  size="lg"
                  onClick={() => setActiveMenu("search")}
                  className="bg-emerald-600 px-8 hover:bg-emerald-700 text-white"
                >
                  Get Started
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <FileUploadSection />
        )}
      </main>
    </div>
  )
}
