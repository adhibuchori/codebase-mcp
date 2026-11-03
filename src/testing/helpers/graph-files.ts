/**
 * Extra sources for the call-graph tests, written into a test workspace on top of the fixture
 * repos: a Java interface with an implementation, a subclass and a wildcard import; TypeScript
 * screens using a class, a namespace, an alias and a component from a design-system repo; and the
 * same shapes in Kotlin and Swift.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { commitAll, git, type Workspace } from './workspace.ts';

const JAVA = 'orders-java/src/main/java/com/acme/orders';

const GRAPH_FILES: Readonly<Record<string, string>> = {
  [`${JAVA}/billing/Refunds.java`]:
    'package com.acme.orders.billing;\n\npublic interface Refunds {\n    void refund(String id);\n}\n',
  [`${JAVA}/billing/CardRefunds.java`]:
    'package com.acme.orders.billing;\n\npublic class CardRefunds implements Refunds {\n    public void refund(String id) {\n        audit(id);\n    }\n\n    protected void audit(String id) {\n    }\n}\n',
  [`${JAVA}/billing/QuickRefunds.java`]:
    'package com.acme.orders.billing;\n\npublic class QuickRefunds extends CardRefunds {\n    void run() {\n        audit("q");\n    }\n}\n',
  [`${JAVA}/jobs/RefundJob.java`]:
    'package com.acme.orders.jobs;\n\nimport com.acme.orders.billing.*;\n\npublic class RefundJob {\n    private CardRefunds card;\n\n    void run() {\n        card.refund("1");\n        var handle = lookup();\n        handle.refund("2");\n    }\n}\n',
  [`${JAVA}/jobs/Settlement.java`]:
    'package com.acme.orders.jobs;\n\nimport com.acme.orders.billing.Refunds;\n\npublic class Settlement {\n    private Refunds refunds;\n\n    void settle() {\n        refunds.refund("3");\n    }\n}\n',
  'gateway-node/src/api/payments.ts':
    'export class PaymentsApi {\n  refund(id: string) {\n    return id;\n  }\n}\n\nexport function formatAmount(amount: number) {\n  return String(amount);\n}\n',
  'gateway-node/src/screens/refund-screen.tsx':
    "import { PaymentsApi } from '../api/payments';\nimport { formatAmount } from '@/api/payments';\nimport * as payments from '../api/payments';\nimport { Badge } from '@acme/design-system';\n\nexport function RefundScreen() {\n  const client: PaymentsApi = new PaymentsApi();\n  client.refund('1');\n  payments.formatAmount(2);\n  return <Badge label={formatAmount(1)} />;\n}\n",
  'design-system/src/badge.tsx': 'export function Badge() {\n  return null;\n}\n',
  'android-app/app/src/main/java/com/acme/app/PaymentsApi.kt':
    'package com.acme.app\n\nclass PaymentsApi {\n    fun refund(id: String) {}\n}\n',
  'android-app/app/src/main/java/com/acme/app/RefundViewModel.kt':
    'package com.acme.app\n\nimport com.acme.app.util.*\n\nclass RefundViewModel(private val api: PaymentsApi) {\n    fun submit() {\n        api.refund("1")\n        this.api.refund("2")\n        topLevel()\n    }\n}\n\nfun topLevel() {}\n',
  'ios-app/App/PaymentsApi.swift': 'final class PaymentsApi {\n    func refund(id: String) {}\n}\n',
  'ios-app/App/RefundViewModel.swift':
    'final class RefundViewModel {\n    private let api: PaymentsApi\n    init(api: PaymentsApi) { self.api = api }\n    func submit() {\n        self.api.refund(id: "1")\n        let other = PaymentsApi()\n        other.refund(id: "2")\n    }\n}\n',
};

/** Writes the graph sources and commits them; new folders become their own git repos. */
export function addGraphFiles(workspace: Workspace): void {
  const repos = new Set<string>();
  for (const [path, text] of Object.entries(GRAPH_FILES)) {
    const target = join(workspace.root, 'shop', path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    repos.add(path.slice(0, path.indexOf('/')));
  }
  for (const repo of repos) {
    const root = workspace.repoPath(repo);
    try {
      git(root, ['rev-parse', '--git-dir']);
    } catch {
      git(root, ['init', '-q', '-b', 'main']);
    }
    commitAll(root, 'test: graph sources');
  }
}
