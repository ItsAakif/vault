'use client'

import { CustomContentTypesManager } from '@/components/content/custom-content-types-manager'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shell'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ContentTypesPage() {
  const router = useRouter()

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        className="p-0"
        title="Content Types"
        description="Manage both system and custom content types. Hide system types you don't use and create custom ones for your specific needs."
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>About Content Types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Content types help you organize and categorize your content. You can manage both system-provided types and create your own custom types.
          </p>
          <div className="space-y-2">
            <h4 className="font-medium">System Content Types:</h4>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Ideas</strong> - Brainstorming and creative concepts</li>
              <li><strong>Poetry</strong> - Creative writing and poems</li>
              <li><strong>Notes</strong> - General notes and thoughts</li>
              <li><strong>Resources</strong> - Links, references, and useful materials</li>
              <li><strong>Projects</strong> - Project documentation and planning</li>
              <li><strong>Job Opportunities</strong> - Career opportunities and applications</li>
              <li><strong>Daily Notes</strong> - Daily journaling and personal reflections</li>
              <li><strong>Archive</strong> - Archived and reference content</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Custom Content Types (examples):</h4>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Recipes</strong> - Store cooking recipes with ingredients and instructions</li>
              <li><strong>Workout Plans</strong> - Track exercise routines and fitness goals</li>
              <li><strong>Book Reviews</strong> - Review and rate books you've read</li>
              <li><strong>Travel Plans</strong> - Organize itineraries and travel information</li>
              <li><strong>Learning Notes</strong> - Educational content and study materials</li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            You can hide system types you don't use and create custom types with their own icons, colors, and structured fields.
          </p>
        </CardContent>
      </Card>

      <CustomContentTypesManager />
    </div>
  )
}
