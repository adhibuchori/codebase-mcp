import logging

from kafka import KafkaConsumer

from app.main import render

logger = logging.getLogger(__name__)


def consume() -> None:
    consumer = KafkaConsumer("orders.cancelled", bootstrap_servers="kafka:9092", group_id="notifications")
    for message in consumer:
        order_id = message.value.decode()
        try:
            render("order-cancelled", order_id)
        except ValueError:
            logger.error("Failed to send notification for order %s", order_id)
