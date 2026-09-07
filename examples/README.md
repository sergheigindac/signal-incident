# Runnable Signal Incident example

Start the application, export its API_TOKEN in a second terminal, then run:

~~~sh
node examples/workflow.js
~~~

Set API_URL if the server runs on a different port. This example uses the named client rather than direct HTTP calls. Each run creates uniquely named resources and validates its results with assertions.

The records remain in the target database so you can inspect them in the console. Use a disposable database for repeated demonstrations. The example disables any recurring work it creates when its workflow completes successfully.

Read the source from top to bottom to follow creation dependencies, resource identifiers, revisions, and idempotency keys. If it fails midway, inspect the printed API error and the audit log before rerunning. A new run uses new resource names.
