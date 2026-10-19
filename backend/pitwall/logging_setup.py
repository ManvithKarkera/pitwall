import logging
import sys

from .config import get_settings


def setup_logging(component: str) -> None:
    # One line per record; the CloudWatch agent ships these files and a
    # metric filter counts the " ERROR " lines.
    logging.basicConfig(
        level=get_settings().log_level,
        stream=sys.stdout,
        format=f"%(asctime)s {component} %(levelname)s %(name)s: %(message)s",
        force=True,
    )
