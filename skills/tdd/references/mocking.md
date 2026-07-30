# When to Mock

Use a mock only at a system seam where the test cannot use the production dependency safely or deterministically.

Common mock seams include:

- External payment or email APIs.
- A database when a representative test database is unavailable or unsuitable for the test.
- Time and randomness.
- A filesystem when a representative temporary filesystem is unsuitable for the test.

Use real implementations for code that the project owns.
Test internal collaborators together through their public interface.

## Design a mockable seam

### Inject external dependencies

Pass an external dependency into the module.
This lets the test supply a controlled adapter.

```typescript
// Easy to mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

### Use operation-specific interfaces

Define one function for each external operation.
Each mock can then return one known result without conditional request handling.

```typescript
// GOOD: Each function is independently mockable
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// BAD: Mocking requires conditional logic inside the mock
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

An operation-specific interface provides:

- One result shape for each mock function.
- No conditional request routing in test setup.
- An explicit list of external operations used by the test.
- A type contract for each operation.
