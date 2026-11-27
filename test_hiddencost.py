from hiddencost import analyze_listing, calculate


def test_calculate_complete_apartment():
    apartment = {
        "months": 12,
        "rent": 1500,
        "parking": 125,
        "utilities": 90,
        "internet": 65,
        "fees": 55,
        "once": 175,
        "deposit": 500,
        "concession": 0,
        "firstMonth": True,
    }
    result = calculate(apartment)
    assert result["recurring"] == 1835
    assert result["effective"] == 1849.5833333333333
    assert result["upfront"] == 2510
    assert result["missing"] == []


def test_calculate_missing_fields_are_tracked():
    apartment = {"months": 12, "rent": 1600, "parking": None, "utilities": None,
                 "internet": None, "fees": None, "once": None, "deposit": None}
    result = calculate(apartment)
    assert result["missing"] == ["parking", "utilities", "internet", "fees", "once", "deposit"]


def test_listing_analyzer_extracts_known_values():
    result = analyze_listing("1-bedroom for $1650/month. Parking $100/month. One month free on a 12-month lease.")
    values = result["values"]
    assert values["rent"] == 1650
    assert values["parking"] == 100
    assert values["months"] == 12
    assert values["concession"] == 1650
