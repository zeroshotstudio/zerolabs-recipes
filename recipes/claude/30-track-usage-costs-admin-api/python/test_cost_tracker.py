"""Offline assertions for the recipe's example pricing calculation."""
import unittest

from cost_tracker import UsageRecord, calculate_cost, get_pricing_key


class CostCalculationTests(unittest.TestCase):
    def test_model_version_normalization(self):
        cases = {
            "claude-3-7-sonnet-20250219": "claude-3-7-sonnet",
            "claude-3-5-haiku-20241022": "claude-3-5-haiku",
            "claude-3-opus-20240229": "claude-3-opus",
        }
        for version, pricing_key in cases.items():
            with self.subTest(version=version):
                self.assertEqual(get_pricing_key(version), pricing_key)

    def test_cost_components_and_cache_ratio(self):
        summary = calculate_cost(UsageRecord(
            workspace_id="test-workspace",
            model="claude-3-7-sonnet-20250219",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_creation_input_tokens=1_000_000,
            cache_read_input_tokens=1_000_000,
        ))
        self.assertEqual((summary.input_cost, summary.output_cost, summary.cache_write_cost, summary.cache_read_cost), (3.0, 15.0, 3.75, 0.3))
        self.assertAlmostEqual(summary.total_cost, 22.05)
        self.assertAlmostEqual(summary.cache_read_ratio, 1 / 3, places=4)
        empty = calculate_cost(UsageRecord(model="claude-3-7-sonnet"))
        self.assertEqual(empty.total_cost, 0)
        self.assertEqual(empty.cache_read_ratio, 0)


if __name__ == "__main__":
    unittest.main()
