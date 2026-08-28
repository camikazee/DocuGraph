import { apiJson } from '../api';
import { getContentAnalytics } from './content-analytics';

jest.mock('../api', () => ({ apiJson: jest.fn() }));

describe('content analytics API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(apiJson).mockResolvedValue({});
  });

  it.each([7, 30, 90] as const)(
    'requests encoded %i-day analytics',
    async (days) => {
      const controller = new AbortController();

      await getContentAnalytics('workspace/a', days, controller.signal);

      expect(apiJson).toHaveBeenCalledWith(
        `/workspaces/workspace%2Fa/documents/content-analytics?days=${days}`,
        { signal: controller.signal },
      );
    },
  );
});
