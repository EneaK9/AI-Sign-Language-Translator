from signapp.services.albanian import stem, to_letters


def test_digraphs_stay_together() -> None:
    assert to_letters("Shqipëri") == ["sh", "q", "i", "p", "ë", "r", "i"]
    assert to_letters("xhaxhi") == ["xh", "a", "xh", "i"]
    assert to_letters("ëndërr") == ["ë", "n", "d", "ë", "rr"]
    assert to_letters("shqip") == ["sh", "q", "i", "p"]
    assert to_letters("gjuha") == ["gj", "u", "h", "a"]
    assert to_letters("rrugë") == ["rr", "u", "g", "ë"]


def test_unknown_characters_are_skipped() -> None:
    assert to_letters("A1-b") == ["a", "b"]


def test_stem_keeps_short_words() -> None:
    assert stem("spitalit") == "spital"
    assert stem("sot") is None
