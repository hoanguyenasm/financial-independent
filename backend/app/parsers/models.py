from dataclasses import dataclass
from datetime import date

@dataclass
class ParsedRow:
    date: date
    description: str
    amount: float          # negative = expense, positive = income
    currency: str          # ISO 4217
