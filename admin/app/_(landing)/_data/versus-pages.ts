/**
 * Data structure for versus comparison pages
 */

// Product identifiers (excluding "original" and "ziru")
export type VersusProductId = "unstructured" | "markitdown";

// Quick comparison card data
export type ComparisonCard = {
  id: string;
  title: string;
  ziru: {
    status: "supported" | "partial" | "not-supported";
    value?: string;
    description: string;
  };
  competitor: {
    status: "supported" | "partial" | "not-supported";
    value?: string;
    description: string;
  };
  importance: "high" | "medium" | "low";
};

// A single demo comparison item (one tab)
export type DemoItem = {
  label: string; // Tab label shown to the user, e.g. "Text Flow"
  ziruOutput: string; // Path to Ziru output HTML
  competitorOutput: string; // Path to competitor output HTML
  originalFile?: string; // Optional: path to original input document HTML
  highlights: {
    ziru: string[]; // Key advantages to highlight
    competitor: string[]; // Key problems to highlight
  };
};

// Live demo configuration — supports multiple comparison tabs
export type LiveDemoConfig = {
  demos: DemoItem[];
};

// Feature comparison row (Phase 2)
export type FeatureRow = {
  id: string;
  feature: string;
  ziru: {
    supported: boolean;
    details?: string;
  };
  competitor: {
    supported: boolean;
    details?: string;
  };
  tooltip?: string;
};

// Use case scenario (Phase 2)
export type UseCase = {
  id: string;
  title: string;
  icon: string; // Lucide icon name
  description: string;
  scenario: string;
  ziruAdvantage: string;
  competitorLimitation: string;
  impact: "high" | "medium" | "low";
};

// FAQ item (Phase 2)
export type FAQItem = {
  id: string;
  question: string;
  answer: string;
  category: "general" | "technical" | "pricing" | "migration";
};

// Testimonial (Phase 2)
export type Testimonial = {
  id: string;
  author: string;
  role: string;
  company: string;
  avatar?: string;
  quote: string;
  rating: number; // 1-5
};

// Complete versus page data
export type VersusPageData = {
  productId: VersusProductId;
  productName: string; // "Unstructured" or "Markitdown"

  // Header navigation (optional - overrides global nav links)
  headerNav?: Array<{
    label: string;
    href: string;
  }>;

  // Hero section
  hero: {
    title: string; // e.g., "Ziru vs Unstructured"
    subtitle: string;
    highlightMetrics?: Array<{
      value: string;
      label: string;
    }>;
    highlightMetric?: {
      value: string;
      label: string;
    };
  };

  // Quick comparison cards (MVP - Phase 1)
  quickComparison: {
    title: string;
    subtitle: string;
    cards: ComparisonCard[];
  };

  // Live demo section (MVP - Phase 1)
  liveDemo: LiveDemoConfig;

  // CTA section (MVP - Phase 1)
  cta: {
    title: string;
    subtitle: string;
    primaryButton: {
      text: string;
      href: string;
    };
    secondaryButton: {
      text: string;
      href: string;
    };
    trustBadges: string[];
  };

  // ===== Optional Sections for Phase 2 =====

  // Detailed feature comparison table (Optional - Phase 2)
  featureTable?: {
    title: string;
    subtitle: string;
    categories: Array<{
      name: string;
      features: FeatureRow[];
    }>;
  };

  // Technical deep dive (Optional - Phase 2)
  technicalDeepDive?: {
    title: string;
    sections: Array<{
      id: string;
      heading: string;
      content: string;
      codeExample?: {
        language: string;
        code: string;
      };
    }>;
  };

  // Use cases (Optional - Phase 2)
  useCases?: {
    title: string;
    subtitle: string;
    cases: UseCase[];
  };

  // FAQ section (Optional - Phase 2)
  faq?: {
    title: string;
    items: FAQItem[];
  };

  // Testimonials (Optional - Phase 2)
  testimonials?: {
    title: string;
    items: Testimonial[];
  };

  // SEO metadata
  seo: {
    title: string;
    description: string;
    keywords: string[];
    ogImage?: string;
  };
};

// Data for Unstructured comparison
export const versusUnstructured: VersusPageData = {
  productId: "unstructured",
  productName: "Unstructured",

  // Empty header nav - no COMPARISON, PRICING, DOCS links
  headerNav: [],

  hero: {
    title: "Ziru vs Unstructured",
    subtitle: "Why Ziru delivers superior document parsing for complex tables",
    highlightMetrics: [
      {
        value: "90%+",
        label: "Complex Table Parsing Accuracy",
      },
      {
        value: "Better",
        label: "Nested Table Detection",
      },
    ],
  },

  quickComparison: {
    title: "Key Differences at a Glance",
    subtitle: "See how Ziru outperforms Unstructured in critical areas",
    cards: [
      {
        id: "multi-level-headers",
        title: "Multi-level Header Detection",
        ziru: {
          status: "supported",
          value: "90%+",
          description: "Accurately identifies 3+ level headers with preserved rowspan/colspan",
        },
        competitor: {
          status: "not-supported",
          value: "0%",
          description: "Treats all cells as <td>, losing header semantics entirely",
        },
        importance: "high",
      },
      {
        id: "table-separation",
        title: "Multi-table Separation",
        ziru: {
          status: "supported",
          description: "Correctly separates 3 distinct tables from complex documents",
        },
        competitor: {
          status: "not-supported",
          description: "Merges separate tables into one, causing data confusion",
        },
        importance: "high",
      },
      {
        id: "merged-cells",
        title: "Merged Cell Handling",
        ziru: {
          status: "supported",
          description: "Preserves rowspan and colspan attributes perfectly",
        },
        competitor: {
          status: "partial",
          description: "Detects merged cells but loses structural information",
        },
        importance: "high",
      },
      {
        id: "nested-table-detection",
        title: "Nested Table Detection",
        ziru: {
          status: "supported",
          description: "Maintains nested table relationships inside parent table cells",
        },
        competitor: {
          status: "partial",
          description: "Often flattens nested table structures and loses hierarchy",
        },
        importance: "medium",
      },
    ],
  },

  liveDemo: {
    demos: [
      {
        label: "Text Flow",
        ziruOutput: "/comparison/text/ziru_textflow_showcase.html",
        competitorOutput: "/comparison/text/unstructured_textflow_showcase.html",
        highlights: {
          ziru: [
            "✅ 75 semantic headings correctly identified — 0% noise rate",
            "✅ 925 focused output lines, coherent paragraph order throughout",
            "✅ TOC tables preserved as structured HTML in the text stream",
          ],
          competitor: [
            "❌ 37 spaced-letter noise lines promoted into heading positions",
            "❌ 26% heading noise rate — 1 in 4 headings is garbage layout text",
            "❌ 21 page-furniture markers pollute and fragment the text stream",
          ],
        },
      },
      {
        label: "Document Structure",
        ziruOutput: "/comparison/text/ziru_navigation_showcase.html",
        competitorOutput: "/comparison/text/unstructured_navigation_showcase.html",
        highlights: {
          ziru: [
            "✅ Clean 4-level semantic tree with 73 navigable nodes",
            "✅ Zero noise signals — every heading is real content",
            "✅ Deterministic hierarchy enables reliable RAG chunk retrieval",
          ],
          competitor: [
            "❌ Shallow 3-level tree polluted by 37 noisy heading entries",
            "❌ Decorative page text mistakenly promoted as section headers",
            "❌ Heading noise degrades retrieval accuracy in downstream pipelines",
          ],
        },
      },
      {
        label: "Table Parsing",
        originalFile: "/comparison/tables/original-input.html",
        ziruOutput: "/comparison/tables/ziru.html",
        competitorOutput: "/comparison/tables/unstructured.html",
        highlights: {
          ziru: [
            "✅ 3-level header structure with proper <th> tags",
            "✅ Three tables correctly separated",
            "✅ Merged cells preserved with rowspan/colspan",
          ],
          competitor: [
            "❌ All cells rendered as <td> — no semantic headers",
            "❌ Tables incorrectly merged into a single structure",
            "❌ Merged cells lost, creating confusing layout",
          ],
        },
      },
    ],
  },

  cta: {
    title: "Ready to Experience the Ziru Advantage?",
    subtitle: "See how we can transform your document parsing workflow",
    primaryButton: {
      text: "Start Free Trial",
      href: "/signup",
    },
    secondaryButton: {
      text: "View Documentation",
      href: "https://docs.ziru.app/",
    },
    trustBadges: ["No credit card required", "14-day free trial", "Setup in 5 minutes"],
  },

  // ===== Phase 2: Optional Sections =====

  featureTable: {
    title: "Complete Feature Comparison",
    subtitle: "Detailed breakdown of all capabilities",
    categories: [
      {
        name: "Table Parsing",
        features: [
          {
            id: "multi-level-headers",
            feature: "Multi-level Headers",
            ziru: { supported: true, details: "Full support for 3+ level headers" },
            competitor: { supported: false, details: "No header detection" },
          },
          {
            id: "merged-cells",
            feature: "Merged Cells (rowspan/colspan)",
            ziru: { supported: true, details: "Perfect preservation" },
            competitor: { supported: true, details: "Partial support, loses structure" },
          },
          {
            id: "table-separation",
            feature: "Multi-table Separation",
            ziru: { supported: true, details: "Accurate separation" },
            competitor: { supported: false, details: "Merges tables incorrectly" },
          },
          {
            id: "nested-tables",
            feature: "Nested Tables",
            ziru: { supported: true, details: "Full nesting support" },
            competitor: { supported: false, details: "Flattens nested structures" },
          },
        ],
      },
      {
        name: "Output Quality",
        features: [
          {
            id: "structure-preservation",
            feature: "Structure Preservation",
            ziru: { supported: true, details: "90%+ on complex tables" },
            competitor: { supported: true, details: "Frequent structure loss in complex layouts" },
          },
          {
            id: "content-order-consistency",
            feature: "Content & Order Consistency",
            ziru: { supported: true, details: "90%+ consistency with source document" },
            competitor: {
              supported: true,
              details: "Lower consistency with misplaced table content",
            },
          },
          {
            id: "html-output",
            feature: "HTML Output",
            ziru: { supported: true, details: "Semantic HTML" },
            competitor: { supported: true, details: "Basic HTML" },
          },
        ],
      },
    ],
  },

  technicalDeepDive: {
    title: "Under the Hood",
    sections: [
      {
        id: "header-detection",
        heading: "Why Multi-level Headers Matter",
        content:
          "Multi-level headers are essential for complex documents like financial reports and scientific papers. Ziru identifies header hierarchies and preserves semantic structure so your RAG pipeline receives reliable context instead of flattened text.",
        codeExample: {
          language: "html",
          code: `<!-- Ziru Output -->
<table>
  <thead>
    <tr>
      <th rowspan="2">Category</th>
      <th colspan="2">Q1 2024</th>
    </tr>
    <tr>
      <th>Revenue</th>
      <th>Profit</th>
    </tr>
  </thead>
  ...
</table>`,
        },
      },
      {
        id: "table-separation",
        heading: "Intelligent Table Separation",
        content:
          "Unstructured often merges separate tables into one, losing critical context. Ziru analyzes layout and content together to detect table boundaries and preserve each table as an independent unit.",
      },
    ],
  },

  useCases: {
    title: "Real-World Scenarios",
    subtitle: "See how Ziru solves actual problems",
    cases: [
      {
        id: "engineering-checklists",
        title: "Engineering Checklist Sheets",
        icon: "FileText",
        description: "Handling spreadsheet sheets that contain multiple mixed tables",
        scenario:
          "An engineering team processes checklist spreadsheets where several unrelated tables appear in one sheet. Feeding raw extracted text directly to models often causes hallucinations.",
        ziruAdvantage:
          "Separates each table block and keeps semantic structure in HTML + markdown outputs, so RAG retrieval maps answers to the correct table context",
        competitorLimitation:
          "Markdown conversion can flatten table boundaries and rely on first-row header assumptions, increasing hallucination risk in model-generated answers",
        impact: "high",
      },
      {
        id: "financial-reports",
        title: "Financial Report Processing",
        icon: "FileText",
        description: "Extracting data from quarterly statements with complex table layouts",
        scenario:
          "A fintech company needs to parse reports with multi-level headers, merged cells, and nested tables to extract metrics for AI analysis.",
        ziruAdvantage:
          "Preserves hierarchy and header semantics with 95%+ structure preservation, so metric extraction remains reliable in downstream pipelines",
        competitorLimitation:
          "Treats first row as headers by default and simplifies nested structure, requiring manual correction before analytics",
        impact: "high",
      },
      {
        id: "research-papers",
        title: "Scientific Research Papers",
        icon: "FileText",
        description: "Processing experimental tables with merged cells and layered headers",
        scenario:
          "Researchers extract experimental results from papers containing dense tables with merged cells and multiple header levels.",
        ziruAdvantage:
          "Maintains relationships across rows, columns, and nested sections, enabling accurate cross-paper aggregation with 98%+ content and order consistency",
        competitorLimitation:
          "Conversion output may contain broken characters and information loss, making data relationships ambiguous for retrieval and analysis",
        impact: "high",
      },
    ],
  },

  faq: {
    title: "Frequently Asked Questions",
    items: [
      {
        id: "why-ziru",
        question: "Why should I choose Ziru over Unstructured?",
        answer:
          "Ziru focuses on structure quality for RAG: 90%+ complex table parsing accuracy, stronger nested-table detection, and better preservation of header relationships. This gives your AI cleaner, more reliable context.",
        category: "general",
      },
      {
        id: "pricing",
        question: "How much does Ziru cost compared to Unstructured?",
        answer:
          "Ziru offers competitive pricing with better value. Pay-as-you-go processing is $1.50 per 100 pages, and we offer volume discounts for enterprise customers.",
        category: "pricing",
      },
      {
        id: "migration",
        question: "How difficult is it to migrate from Unstructured to Ziru?",
        answer:
          "Migration is straightforward. Ziru provides a drop-in replacement API with similar endpoints. Most customers complete migration in under a day with our migration guide and support team assistance.",
        category: "migration",
      },
      {
        id: "header-detection",
        question: "How does Ziru detect multi-level headers?",
        answer:
          "Ziru uses advanced layout analysis combined with content understanding to identify header hierarchies. Our algorithm analyzes cell positioning, styling, and content patterns to accurately determine rowspan and colspan attributes.",
        category: "technical",
      },
      {
        id: "table-separation",
        question: "What makes Ziru better at separating tables?",
        answer:
          "Ziru combines layout analysis with semantic cues to identify true table boundaries. This helps keep neighboring tables independent even when they appear close together in complex documents.",
        category: "technical",
      },
    ],
  },

  testimonials: {
    title: "What Our Customers Say",
    items: [
      {
        id: "testimonial-1",
        author: "Sarah Chen",
        role: "Head of Data Engineering",
        company: "FinTech Solutions Inc.",
        rating: 5,
        quote:
          "Switching to Ziru was a game-changer for our financial document processing. The accuracy improvement alone saved us hundreds of hours of manual correction.",
      },
      {
        id: "testimonial-2",
        author: "Dr. Michael Rodriguez",
        role: "Research Lead",
        company: "Academic Research Institute",
        rating: 5,
        quote:
          "Ziru's ability to preserve complex table structures has enabled us to automate research data extraction that was previously impossible with Unstructured.",
      },
      {
        id: "testimonial-3",
        author: "Alex Thompson",
        role: "CTO",
        company: "DataAnalytics Pro",
        rating: 5,
        quote:
          "Ziru's structure quality has made our extraction pipeline far more reliable, and we've reduced manual fixes across our reporting workflow.",
      },
    ],
  },

  seo: {
    title: "Ziru vs Unstructured: Document Parsing Comparison | Ziru",
    description:
      "Compare Ziru and Unstructured for document parsing. Ziru delivers 90%+ complex table parsing accuracy with stronger nested-table and header-structure preservation.",
    keywords: [
      "ziru vs unstructured",
      "document parsing comparison",
      "unstructured alternative",
      "table parsing accuracy",
      "document structure preservation",
      "RAG document processing",
      "complex table handling",
      "multi-level headers",
    ],
    ogImage: "/og-images/versus-unstructured.png",
  },
};

// Data for Markitdown comparison
export const versusMarkitdown: VersusPageData = {
  productId: "markitdown",
  productName: "Markitdown",

  // Empty header nav - no COMPARISON, PRICING, DOCS links
  headerNav: [],

  hero: {
    title: "Ziru vs Markitdown",
    subtitle: "Why Ziru is the superior choice for markdown conversion",
    highlightMetrics: [
      {
        value: "95%+",
        label: "Structure Preservation",
      },
      {
        value: "98%+",
        label: "Content & Order Consistency",
      },
    ],
  },

  quickComparison: {
    title: "Key Differences at a Glance",
    subtitle: "See how Ziru outperforms Markitdown in critical areas",
    cards: [
      {
        id: "table-preservation",
        title: "Table Structure Preservation",
        ziru: {
          status: "supported",
          value: "95%+",
          description: "Preserves complex table structures with merged cells and headers",
        },
        competitor: {
          status: "partial",
          value: "40%",
          description: "Loses table structure in markdown conversion",
        },
        importance: "high",
      },
      {
        id: "semantic-markup",
        title: "Semantic HTML Output",
        ziru: {
          status: "supported",
          description: "Maintains semantic HTML tags for better data extraction",
        },
        competitor: {
          status: "not-supported",
          description: "Converts to plain markdown, losing semantic information",
        },
        importance: "high",
      },
      {
        id: "header-detection",
        title: "Header Hierarchy Detection",
        ziru: {
          status: "supported",
          description: "Accurately identifies multi-level table headers",
        },
        competitor: {
          status: "partial",
          description: "Treats first row as headers by default, no sophisticated parsing",
        },
        importance: "high",
      },
      {
        id: "output-quality",
        title: "Output Quality",
        ziru: {
          status: "supported",
          value: "98%+",
          description: "98%+ content and order consistency with the original document",
        },
        competitor: {
          status: "partial",
          value: "72%",
          description: "Can produce broken characters and information loss in conversion output",
        },
        importance: "medium",
      },
    ],
  },

  liveDemo: {
    demos: [
      {
        label: "Text Flow",
        ziruOutput: "/comparison/text/ziru_textflow_showcase.html",
        competitorOutput: "/comparison/text/markitdown_textflow_showcase.html",
        highlights: {
          ziru: [
            "✅ 75 semantic headings correctly identified — 0 noise lines",
            "✅ 925 lean output lines with full paragraph coherence",
            "✅ TOC tables preserved as structured HTML, not broken characters",
          ],
          competitor: [
            "❌ Zero markdown headings detected — no structural navigation at all",
            "❌ 704 single-character noise lines from vertical decorative text",
            "❌ 4001 output lines — 4× more noise than actual document content",
          ],
        },
      },
      {
        label: "Document Structure",
        ziruOutput: "/comparison/text/ziru_navigation_showcase.html",
        competitorOutput: "/comparison/text/markitdown_navigation_showcase.html",
        highlights: {
          ziru: [
            "✅ 4-level semantic document tree with 73 navigable nodes",
            "✅ Zero noise signals — every heading is real content",
            "✅ Enables accurate, deterministic RAG chunk retrieval",
          ],
          competitor: [
            "❌ No heading tree structure generated at all",
            "❌ 704 noise signals make section navigation impossible",
            "❌ All section titles appear as plain text, indistinguishable from body",
          ],
        },
      },
      {
        label: "Table Parsing",
        originalFile: "/comparison/tables/original-input.html",
        ziruOutput: "/comparison/tables/ziru.html",
        competitorOutput: "/comparison/tables/markitdown.html",
        highlights: {
          ziru: [
            "✅ Complete table structure preservation with semantic relationships",
            "✅ Accurate multi-level header detection",
            "✅ Handles merged cells and complex layouts reliably",
          ],
          competitor: [
            "❌ Table structure simplified during markdown conversion",
            "❌ Header hierarchy information is often lost",
            "❌ Broken characters and information loss may appear in output",
          ],
        },
      },
    ],
  },

  cta: {
    title: "Ready to Experience the Ziru Advantage?",
    subtitle: "Transform your document parsing with superior accuracy",
    primaryButton: {
      text: "Start Free Trial",
      href: "/signup",
    },
    secondaryButton: {
      text: "View Documentation",
      href: "https://docs.ziru.app/",
    },
    trustBadges: ["No credit card required", "14-day free trial", "Setup in 5 minutes"],
  },

  // ===== Phase 2: Optional Sections =====

  featureTable: {
    title: "Complete Feature Comparison",
    subtitle: "Detailed breakdown of all capabilities",
    categories: [
      {
        name: "Structure Quality",
        features: [
          {
            id: "table-structure",
            feature: "Table Structure Preservation",
            ziru: { supported: true, details: "95%+ preservation" },
            competitor: {
              supported: true,
              details: "Basic preservation with frequent simplification",
            },
          },
          {
            id: "content-order-consistency",
            feature: "Content & Order Consistency",
            ziru: { supported: true, details: "98%+ consistency with source content order" },
            competitor: {
              supported: true,
              details: "Lower consistency with occasional character corruption",
            },
          },
          {
            id: "header-hierarchy",
            feature: "Header Hierarchy",
            ziru: { supported: true, details: "Multi-level support" },
            competitor: { supported: true, details: "First-row default heuristic" },
          },
          {
            id: "nested-tables",
            feature: "Nested Table Detection",
            ziru: { supported: true, details: "Preserves nested tables inside cells" },
            competitor: { supported: false, details: "No sophisticated nested-table parsing" },
          },
          {
            id: "semantic-markup",
            feature: "HTML Output",
            ziru: { supported: true, details: "Semantic HTML alongside markdown output" },
            competitor: {
              supported: false,
              details: "Markdown-focused output with limited semantics",
            },
          },
        ],
      },
    ],
  },

  technicalDeepDive: {
    title: "Under the Hood",
    sections: [
      {
        id: "structure-preservation",
        heading: "Why Structure Preservation Matters",
        content:
          "Markdown conversion often simplifies complex table structures and drops semantic relationships. Ziru keeps semantic HTML output alongside markdown, preserving critical hierarchy for higher-fidelity RAG ingestion.",
        codeExample: {
          language: "markdown",
          code: `<!-- Ziru preserves this structure -->
| Category | Q1    | Q2    |
|----------|-------|-------|
|          | Revenue | Profit |
| Sales    | $100K | $30K  |

<!-- Instead of losing it like competitors -->`,
        },
      },
      {
        id: "semantic-output",
        heading: "Semantic HTML Advantage",
        content:
          "Unlike markdown-first converters, Ziru provides semantic HTML that preserves table hierarchy, headers, and relationships. This is critical for RAG applications that depend on structural context.",
      },
    ],
  },

  useCases: {
    title: "Real-World Scenarios",
    subtitle: "See how Ziru solves actual problems",
    cases: [
      {
        id: "engineering-checklists",
        title: "Engineering Checklist Sheets",
        icon: "FileText",
        description: "Handling spreadsheet sheets that contain multiple mixed tables",
        scenario:
          "An engineering team processes checklist spreadsheets where several unrelated tables appear in one sheet. Feeding raw extracted text directly to models often causes hallucinations.",
        ziruAdvantage:
          "Separates each table block and preserves structure so downstream RAG retrieval maps answers to the right table context",
        competitorLimitation:
          "Can merge table boundaries or flatten structure, increasing hallucination risk in model-generated answers",
        impact: "high",
      },
      {
        id: "financial-reports",
        title: "Financial Report Processing",
        icon: "FileText",
        description: "Extracting data from quarterly statements with complex table layouts",
        scenario:
          "A fintech company needs to parse reports with multi-level headers, merged cells, and nested tables to extract metrics for AI analysis.",
        ziruAdvantage:
          "Preserves table hierarchy and header semantics, supporting reliable metric extraction with 90%+ complex-table accuracy",
        competitorLimitation:
          "Loses header relationships and can collapse nested structure, requiring manual correction before analytics",
        impact: "high",
      },
      {
        id: "research-papers",
        title: "Scientific Research Papers",
        icon: "FileText",
        description: "Processing experimental tables with merged cells and layered headers",
        scenario:
          "Researchers extract experimental results from papers containing dense tables with merged cells and multiple header levels.",
        ziruAdvantage:
          "Maintains structural relationships across rows, columns, and nested sections, enabling accurate cross-paper aggregation",
        competitorLimitation:
          "Flattens or simplifies complex table structure, making data relationships ambiguous for retrieval and analysis",
        impact: "high",
      },
    ],
  },

  faq: {
    title: "Frequently Asked Questions",
    items: [
      {
        id: "why-ziru",
        question: "Why choose Ziru over Markitdown?",
        answer:
          "Ziru focuses on reliable structure quality: 95%+ table structure preservation and 98%+ content and order consistency, plus semantic HTML output for downstream RAG and data workflows.",
        category: "general",
      },
      {
        id: "html-advantage",
        question: "Why does HTML output matter if I need markdown?",
        answer:
          "HTML preserves all semantic information that markdown can't express. Ziru gives you both formats, so you can use markdown for display while keeping the full structure in HTML for data processing and RAG applications.",
        category: "technical",
      },
      {
        id: "migration-process",
        question: "How easy is it to switch from Markitdown to Ziru?",
        answer:
          "Very easy. Ziru provides markdown output plus semantic HTML. Most teams can swap endpoints first, then incrementally adopt richer structure output for better downstream accuracy.",
        category: "migration",
      },
      {
        id: "pricing-comparison",
        question: "Is Ziru more expensive than Markitdown?",
        answer:
          "Ziru offers competitive pricing with significantly better output quality. Pay-as-you-go processing is $1.50 per 100 pages, and enterprise plans include volume discounts.",
        category: "pricing",
      },
      {
        id: "structure-preservation",
        question: "How does Ziru achieve better structure preservation?",
        answer:
          "Ziru uses advanced document analysis to understand table semantics, not just layout. We maintain rowspan, colspan, and header relationships that markdown conversion typically loses.",
        category: "technical",
      },
    ],
  },

  testimonials: {
    title: "What Our Customers Say",
    items: [
      {
        id: "testimonial-1",
        author: "Jennifer Liu",
        role: "Technical Writer",
        company: "DevDocs Platform",
        rating: 5,
        quote:
          "Ziru transformed our documentation pipeline. The ability to preserve complex table structures in markdown has saved our team countless hours of manual formatting.",
      },
      {
        id: "testimonial-2",
        author: "Marcus Johnson",
        role: "Engineering Manager",
        company: "KnowledgeHub Inc.",
        rating: 5,
        quote:
          "Migrating our knowledge base was seamless with Ziru. The semantic HTML output gave us flexibility we never had with Markitdown.",
      },
      {
        id: "testimonial-3",
        author: "Emily Watson",
        role: "Content Operations Lead",
        company: "ContentFlow Systems",
        rating: 5,
        quote:
          "The output quality difference is remarkable. Our content now maintains its structure across all formats, which has significantly improved our content management workflow.",
      },
    ],
  },

  seo: {
    title: "Ziru vs Markitdown: Markdown Conversion Comparison | Ziru",
    description:
      "Compare Ziru and Markitdown for document conversion. Ziru delivers 95%+ structure preservation, 98%+ content and order consistency, and semantic output.",
    keywords: [
      "ziru vs markitdown",
      "markdown conversion comparison",
      "markitdown alternative",
      "table to markdown",
      "complex table handling",
      "semantic html preservation",
      "document structure accuracy",
    ],
    ogImage: "/og-images/versus-markitdown.png",
  },
};

// Map for easy lookup
export const VERSUS_PAGES: Record<VersusProductId, VersusPageData> = {
  unstructured: versusUnstructured,
  markitdown: versusMarkitdown,
};

// Helper to validate product ID
export function isValidVersusProductId(id: string): id is VersusProductId {
  return id === "unstructured" || id === "markitdown";
}

// Helper to get versus page data
export function getVersusPageData(productId: VersusProductId): VersusPageData {
  return VERSUS_PAGES[productId];
}
