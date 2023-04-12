# Sailhouse Client ⛵

The [Sailhouse](https://sailhouse.dev) Client provides an idomatic abstraction over the Sailhouse HTTP API.

## Basic Use

```ts
const token = "sh_" // ......
const client = new SailhouseClient(token);

await client.sendEvent("test-event", { message: "Hello World!" });
```
