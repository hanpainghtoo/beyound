import { MediaLibraryService } from '../media/media-library.service';
import { PlatformMediaController } from './platform-media.controller';

describe('PlatformMediaController', () => {
  const createMockService = () =>
    ({
      createPlatformUpload: jest.fn(),
      getPlatformDownloadUrl: jest.fn(),
    }) as unknown as MediaLibraryService;

  it('delegates platform uploads with the authenticated admin ID', async () => {
    const mediaLibraryService = createMockService();
    mediaLibraryService.createPlatformUpload = jest.fn().mockResolvedValue({
      file: { id: 'file-1', tenantId: 'platform' },
      upload: { url: 'https://files.example/upload' },
    });
    const controller = new PlatformMediaController(mediaLibraryService);
    const input = {
      fileName: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      purpose: 'billingaccount-icon',
    };

    await expect(
      controller.createUpload({ user: { id: 'admin-1' } }, input),
    ).resolves.toMatchObject({ file: { id: 'file-1' } });
    expect(mediaLibraryService.createPlatformUpload).toHaveBeenCalledWith(
      'admin-1',
      input,
    );
  });

  it('resolves platform download URLs through the platform storage scope', async () => {
    const mediaLibraryService = createMockService();
    mediaLibraryService.getPlatformDownloadUrl = jest.fn().mockResolvedValue({
      file: { id: 'file-1', tenantId: 'platform' },
      download: { url: 'https://files.example/download' },
    });
    const controller = new PlatformMediaController(mediaLibraryService);

    await expect(
      controller.getDownloadUrl({ user: { id: 'admin-1' } }, 'file-1'),
    ).resolves.toMatchObject({ file: { id: 'file-1' } });
    expect(mediaLibraryService.getPlatformDownloadUrl).toHaveBeenCalledWith(
      'file-1',
    );
  });
});
