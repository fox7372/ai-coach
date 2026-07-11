from app.runtime import *

def validate_public_url(url: str) -> str:
    clean_url = url.strip()
    if len(clean_url) > 2048:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="链接过长")

    parsed = urlparse(clean_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只支持公开 http/https 链接")

    host = parsed.hostname.lower()
    if host in {"localhost", "127.0.0.1", "0.0.0.0"} or host.endswith(".local"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不允许导入本机或内网链接")

    try:
        infos = socket.getaddrinfo(host, None)
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不允许导入内网、保留地址或本机地址")
    except HTTPException:
        raise
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"链接域名无法解析：{exc}") from exc

    return clean_url


def detect_video_platform(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if "youtube.com" in host or "youtu.be" in host:
        return "youtube"
    if "bilibili.com" in host or "b23.tv" in host:
        return "bilibili"
    return "web_video"


def normalize_video_url(url: str) -> str:
    clean_url = validate_public_url(url)
    parsed = urlparse(clean_url)
    host = (parsed.hostname or "").lower()
    if "bilibili.com" in host:
        match = re.search(r"/video/(BV[\w]+)", parsed.path)
        if match:
            return f"{parsed.scheme}://{parsed.netloc}/video/{match.group(1)}/"
    if "youtu.be" in host or "youtube.com" in host:
        return clean_url
    return clean_url


def build_timestamp_url(source_url: str | None, start_time: float | None) -> str | None:
    if not source_url or start_time is None:
        return source_url
    seconds = max(0, int(start_time))
    parsed = urlparse(source_url)
    host = (parsed.hostname or "").lower()
    if "youtube.com" in host or "youtu.be" in host:
        query = parse_qs(parsed.query)
        query["t"] = [f"{seconds}s"]
        return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))
    if "bilibili.com" in host or "b23.tv" in host:
        query = parse_qs(parsed.query)
        query["t"] = [str(seconds)]
        return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))
    return f"{source_url}#t={seconds}"


def format_time(seconds: float | None) -> str:
    if seconds is None:
        return "未知时间"
    total = max(0, int(seconds))
    minutes, sec = divmod(total, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{sec:02d}"
    return f"{minutes:02d}:{sec:02d}"
