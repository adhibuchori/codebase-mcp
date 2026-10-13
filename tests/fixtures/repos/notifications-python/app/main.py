from fastapi import FastAPI

app = FastAPI()

TEMPLATES = {"order-cancelled": "Your order {order_id} was cancelled."}


def render(name: str, order_id: str) -> str:
    template = TEMPLATES.get(name)
    if template is None:
        raise ValueError(f"Unknown template: {name}")
    return template.format(order_id=order_id)


@app.post("/notify")
def notify(name: str, order_id: str) -> dict:
    return {"text": render(name, order_id)}
