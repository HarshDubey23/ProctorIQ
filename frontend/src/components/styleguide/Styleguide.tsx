import { Check, Stamp } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

const structuralTokens = [
  { name: 'Paper', hex: '#F4F1EA', className: 'bg-paper text-ink' },
  { name: 'Paper-2', hex: '#E8E3D7', className: 'bg-paper-2 text-ink' },
  { name: 'Ink', hex: '#1A1A17', className: 'bg-ink text-paper' },
  { name: 'Ink-Slate', hex: '#3A3D42', className: 'bg-ink-slate text-paper' },
  { name: 'Graphite', hex: '#6B6E74', className: 'bg-graphite text-paper' },
  { name: 'Stamp Red', hex: '#9B2D20', className: 'bg-stamp text-paper' },
  { name: 'Ledger Green', hex: '#2F5D50', className: 'bg-ledger text-paper' },
  { name: 'Warning Ochre', hex: '#B57A1E', className: 'bg-ochre text-ink' },
];

const signalTokens = [
  { name: 'Gaze / Attention', hex: '#3E8E7E', className: 'bg-signal-gaze text-paper' },
  { name: 'Head-Pose', hex: '#5B6BB0', className: 'bg-signal-head text-paper' },
  { name: 'Audio Anomaly', hex: '#A8556E', className: 'bg-signal-audio text-paper' },
  { name: 'Tab-Focus', hex: '#C08A2E', className: 'bg-signal-tab text-ink' },
];

const typeScale = [
  { name: 'display-1', className: 'font-display text-3xl md:text-display-1', text: 'PROCTORIQ' },
  { name: 'display-2', className: 'font-display text-2xl md:text-display-2', text: 'EXAM HALL' },
  { name: 'h1', className: 'font-display text-3xl', text: 'Create Exam' },
  { name: 'h2', className: 'font-display text-2xl', text: 'Live Integrity' },
  { name: 'body-lg', className: 'font-body text-lg', text: 'Browser-first, privacy-preserving exam integrity.' },
  { name: 'body', className: 'font-body text-base', text: 'All video inference stays client-side.' },
  { name: 'label', className: 'font-label text-label uppercase', text: 'MCQ / 2 MARKS / MEDIUM' },
  { name: 'data-lg', className: 'font-mono text-data-lg font-bold', text: '99.22' },
];

function TokenSwatch({ token }: { token: { name: string; hex: string; className: string } }) {
  return (
    <div className="border-[3px] border-ink bg-paper shadow-brutal-sm">
      <div className={`flex h-24 items-end p-3 ${token.className}`}>
        <span className="font-label text-label uppercase">{token.name}</span>
      </div>
      <div className="flex items-center justify-between border-t-[3px] border-ink px-3 py-2">
        <span className="font-body text-sm">{token.name}</span>
        <span className="font-mono text-xs">{token.hex}</span>
      </div>
    </div>
  );
}

export function Styleguide() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex max-w-[1200px] flex-col gap-12 px-5 py-12 md:px-8 md:py-24">
        <header className="grid gap-6 border-[4px] border-ink bg-paper p-6 shadow-brutal-lg md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <Badge variant="stamp">Phase 0 Approval Gate</Badge>
            <h1 className="mt-5 max-w-4xl font-display text-3xl uppercase sm:text-display-2 md:text-display-1">
              ProctorIQ Styleguide
            </h1>
            <p className="mt-4 max-w-2xl font-body text-lg text-graphite">
              Foundations only: exact printerly tokens, four-font system, hard borders, and brutalist primitives.
            </p>
          </div>
          <div className="grid content-end gap-3 border-[3px] border-ink bg-paper-2 p-4">
            <span className="font-label text-label uppercase text-graphite">Material Rule</span>
            <p className="font-display text-2xl uppercase">Official examination document as live instrument.</p>
          </div>
        </header>

        <section className="grid gap-4">
          <div>
            <Badge>Color Tokens</Badge>
            <h2 className="mt-3 font-display text-2xl uppercase sm:text-3xl">Structural Palette</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {structuralTokens.map((token) => (
              <TokenSwatch key={token.name} token={token} />
            ))}
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {signalTokens.map((token) => (
              <TokenSwatch key={token.name} token={token} />
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <div>
            <Badge>Type Scale</Badge>
            <h2 className="mt-3 font-display text-2xl uppercase sm:text-3xl">Four Fonts, Four Jobs</h2>
          </div>
          <div className="border-[3px] border-ink bg-paper shadow-brutal">
            {typeScale.map((type) => (
              <div key={type.name} className="grid gap-3 border-b-[3px] border-ink p-5 last:border-b-0 md:grid-cols-[160px_1fr]">
                <span className="font-label text-label uppercase text-graphite">{type.name}</span>
                <span className={type.className}>{type.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <Badge variant="stamp">Buttons</Badge>
              <CardTitle>Pressed Stamp Controls</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Button variant="primary">
                <Stamp size={18} />
                Publish
              </Button>
              <Button>
                <Check size={18} />
                Verify
              </Button>
              <Button variant="ghost">Ghost</Button>
              <Button disabled className="opacity-40">
                Disabled
              </Button>
            </CardContent>
            <CardFooter>
              <p className="font-body text-sm text-graphite">Hover and press move the control into its hard shadow.</p>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <Badge>Inputs</Badge>
              <CardTitle>Form Surface</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label className="grid gap-2">
                <span className="font-label text-label uppercase text-graphite">Exam Title</span>
                <Input placeholder="Midterm Integrity Check" />
              </label>
              <div className="flex flex-wrap gap-3">
                <Badge>MCQ</Badge>
                <Badge variant="ledger">Verified</Badge>
                <Badge variant="ochre">Pending</Badge>
                <Badge variant="graphite">Draft</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4">
          <div>
            <Badge>Table</Badge>
            <h2 className="mt-3 font-display text-2xl uppercase sm:text-3xl">Sample Official Form</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-label text-label uppercase">Stamp Red</TableCell>
                <TableCell>Brand accent and primary CTA</TableCell>
                <TableCell className="font-mono">#9B2D20</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-label text-label uppercase">Ledger Green</TableCell>
                <TableCell>Verified or pass state only</TableCell>
                <TableCell className="font-mono">#2F5D50</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-label text-label uppercase">Gaze</TableCell>
                <TableCell>Dashboard signal channel</TableCell>
                <TableCell className="font-mono">#3E8E7E</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
      </section>
    </main>
  );
}
