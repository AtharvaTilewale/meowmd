/**
 * MeowMD document templates (templates.js)
 * Each template: title, description, icon (Font Awesome solid class), markdown.
 */
window.MEOW_TEMPLATES = {
  readme: {
    title: 'README',
    description: 'Project overview with badges, install, usage and contributing sections.',
    icon: 'fa-book',
    markdown: `# Project Name

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](#)

One or two sentences that say what this project does and who it is for.

## Features

- Does one thing well
- Works offline and needs no configuration
- Documented, tested and easy to extend

## Installation

\`\`\`bash
npm install project-name
\`\`\`

## Usage

\`\`\`js
import { thing } from 'project-name';

thing({ option: true });
\`\`\`

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| \`option\` | boolean | \`false\` | Turns the thing on |
| \`timeout\` | number | \`3000\` | Milliseconds before giving up |

## Roadmap

- [x] Core functionality
- [ ] Plugin system
- [ ] Documentation site

## Contributing

Pull requests are welcome. For larger changes, open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create a branch: \`git checkout -b feature/my-change\`
3. Commit your changes and open a pull request

## License

[MIT](LICENSE)
`
  },

  changelog: {
    title: 'CHANGELOG',
    description: 'Keep a Changelog format with Unreleased, versions and change types.',
    icon: 'fa-clock-rotate-left',
    markdown: `# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New feature that is on the way

### Changed

- Behaviour that changed

### Fixed

- Bug that is fixed on the main branch

## [1.1.0] - ${new Date().toISOString().slice(0, 10)}

### Added

- Something new users can do

### Deprecated

- Old option that will be removed in 2.0

## [1.0.0] - 2026-01-01

### Added

- First public release

[Unreleased]: https://github.com/user/repo/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/user/repo/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/user/repo/releases/tag/v1.0.0
`
  },

  adr: {
    title: 'Architecture decision record',
    description: 'Context, decision, consequences. The lightweight ADR format.',
    icon: 'fa-sitemap',
    markdown: `# ADR-001: Short title of the decision

- **Status:** Proposed
- **Date:** ${new Date().toISOString().slice(0, 10)}
- **Deciders:** Name, Name
- **Tags:** architecture, backend

## Context

What is the issue that motivates this decision? Describe the forces at play: technical, business, team, time.

## Decision

State the decision in one or two sentences, in the active voice. "We will use X because Y."

## Options considered

### Option A

- Pros: ...
- Cons: ...

### Option B

- Pros: ...
- Cons: ...

## Consequences

**Positive**

- What becomes easier

**Negative**

- What becomes harder, and what we accept

**Follow-ups**

- [ ] Task that this decision creates
`
  },

  pr: {
    title: 'Pull request',
    description: 'Summary, changes, testing notes and a reviewer checklist.',
    icon: 'fa-code-pull-request',
    markdown: `## Summary

One paragraph on what this pull request does and why. Link the issue it closes.

Closes #123

## Changes

- Added ...
- Changed ...
- Removed ...

## How to test

1. Check out this branch
2. Run \`npm test\`
3. Open the app and try ...

## Screenshots

| Before | After |
| --- | --- |
| ![before](url) | ![after](url) |

## Checklist

- [ ] Tests added or updated
- [ ] Documentation updated
- [ ] No breaking changes, or they are called out above
- [ ] Reviewed my own diff

> [!NOTE]
> Anything the reviewer should look at first.
`
  },

  'lab-report': {
    title: 'Lab report',
    description: 'Abstract, method, results with math and tables, discussion, references.',
    icon: 'fa-flask',
    markdown: `# Experiment title

**Course:** Course name · **Author:** Your name · **Date:** ${new Date().toISOString().slice(0, 10)}

## Abstract

Two or three sentences: the question, the method, the headline result.

## Introduction

Background and the hypothesis being tested. Define the key quantity:

$$
v = \\frac{\\Delta x}{\\Delta t}
$$

## Method

1. Set up the apparatus as shown in Figure 1
2. Record the measurement five times
3. Repeat for each condition

## Results

| Trial | Input (m) | Output (s) | Derived (m/s) |
| --- | ---: | ---: | ---: |
| 1 | 1.00 | 0.45 | 2.22 |
| 2 | 1.00 | 0.47 | 2.13 |
| 3 | 1.00 | 0.44 | 2.27 |

Mean: $\\bar{v} = 2.21$ m/s, standard deviation $\\sigma = 0.07$ m/s.

\`\`\`chart
{"type":"line","title":"Output by trial","labels":["1","2","3"],"series":{"Output (s)":[0.45,0.47,0.44]}}
\`\`\`

## Discussion

Compare the result with the expected value. Identify sources of error and how they could be reduced.

## Conclusion

Restate the finding in one sentence and whether the hypothesis held.

## References

1. Author, *Title*, Publisher, Year.
`
  },

  'meeting-notes': {
    title: 'Meeting notes',
    description: 'Attendees, agenda, decisions and action items with owners.',
    icon: 'fa-people-group',
    markdown: `# Meeting: Topic

**Date:** ${new Date().toISOString().slice(0, 10)} · **Time:** 10:00 · **Location:** Room / call link

## Attendees

- Name (facilitator)
- Name (notes)
- Name

## Agenda

1. Review of last actions
2. Main topic
3. Open questions

## Notes

### Review of last actions

- ...

### Main topic

- ...

## Decisions

- **Decision 1:** What was decided and why

## Action items

- [ ] Action, owner, due date
- [ ] Action, owner, due date

## Next meeting

Date, time and proposed agenda.
`
  },

  resume: {
    title: 'Resume',
    description: 'Single-page resume that exports cleanly to PDF and Word.',
    icon: 'fa-id-card',
    markdown: `# Your Name

City, Country · you@example.com · [github.com/you](https://github.com/you) · [linkedin.com/in/you](https://linkedin.com/in/you)

## Summary

Two sentences on who you are, what you do best, and what you are looking for.

## Experience

### Role, Company — City

*2023 – present*

- Led ... which resulted in ...
- Built ... used by ...
- Reduced ... by 40%

### Role, Company — City

*2021 – 2023*

- ...
- ...

## Projects

- **[Project name](https://github.com/you/project):** What it does, what you used, why it matters.
- **[Project name](https://github.com/you/project):** ...

## Skills

| Area | Tools |
| --- | --- |
| Languages | Python, TypeScript, Go |
| Platforms | Linux, AWS, Docker, Kubernetes |
| Practices | Testing, CI/CD, code review |

## Education

**Degree, Institution** — Year

## Certifications

- Certification, Issuer, Year
`
  },

  'blog-post': {
    title: 'Blog post',
    description: 'Front matter, hook, sections, code sample and a closing summary.',
    icon: 'fa-pen-nib',
    markdown: `---
title: "Post title"
date: ${new Date().toISOString().slice(0, 10)}
tags: [markdown, writing]
description: "One sentence that appears in search results."
---

# Post title

A one-paragraph hook: the problem, why it matters, what the reader gets by the end.

## The problem

Explain the situation with a concrete example.

## The approach

Walk through the solution step by step.

\`\`\`python
def solve(items):
    return sorted(items, key=lambda x: x.priority)
\`\`\`

> [!TIP]
> Call out the one thing people get wrong.

## Results

What changed, with numbers if you have them.

## Summary

- Key takeaway one
- Key takeaway two
- Where to go next
`
  }
};
