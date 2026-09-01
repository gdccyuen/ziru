import logging
if not hasattr(logging, "_acquireLock") and hasattr(logging, "_lock"):
    logging._acquireLock = logging._lock.acquire
    logging._releaseLock = logging._lock.release
