"""Chart image preprocessing.

Provides image normalization, cropping, and enhancement for chart analysis.
Uses OpenCV for image processing operations.
"""

from dataclasses import dataclass
from typing import cast

import cv2  # type: ignore[import-not-found,unused-ignore]
import numpy as np
from numpy.typing import NDArray

from .models import BoundingBox, ImageMetadata, ProcessedImage


@dataclass
class PreprocessorConfig:
    """Configuration for image preprocessing."""

    # Target dimensions
    target_width: int = 800
    target_height: int = 600
    maintain_aspect_ratio: bool = True

    # Normalization
    normalize_brightness: bool = True
    target_brightness: float = 0.5  # 0-1 scale

    # Edge detection for chart region
    detect_chart_region: bool = True
    chart_padding: int = 10  # Pixels to add around detected chart

    # Color processing
    grayscale: bool = False
    enhance_contrast: bool = True
    contrast_factor: float = 1.2


class ChartPreprocessor:
    """Preprocessor for chart images."""

    def __init__(self, config: PreprocessorConfig | None = None) -> None:
        """Initialize preprocessor with config.

        Args:
            config: Preprocessing configuration. Uses defaults if None.
        """
        self.config = config or PreprocessorConfig()

    def process(self, image: NDArray[np.uint8]) -> tuple[NDArray[np.uint8], ProcessedImage]:
        """Process a chart image for analysis.

        Args:
            image: Input image as numpy array (H, W, C) or (H, W) for grayscale.

        Returns:
            Tuple of (processed image array, ProcessedImage metadata).
        """
        original_height, original_width = image.shape[:2]
        channels = image.shape[2] if len(image.shape) > 2 else 1

        # Detect chart region if enabled
        chart_region = None
        if self.config.detect_chart_region:
            chart_region = self._detect_chart_region(image)
            if chart_region:
                image = self._crop_to_region(image, chart_region)

        # Convert to grayscale if requested
        if self.config.grayscale and channels > 1:
            image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)  # type: ignore[assignment]
            channels = 1

        # Normalize brightness
        if self.config.normalize_brightness:
            image = self._normalize_brightness(image)

        # Enhance contrast
        if self.config.enhance_contrast:
            image = self._enhance_contrast(image)

        # Resize to target dimensions
        image = self._resize(image)

        processed_height, processed_width = image.shape[:2]

        metadata = ImageMetadata(
            width=original_width,
            height=original_height,
            channels=channels,
            chart_region=chart_region,
        )

        processed_info = ProcessedImage(
            original_width=original_width,
            original_height=original_height,
            processed_width=processed_width,
            processed_height=processed_height,
            metadata=metadata,
        )

        return image, processed_info

    def _detect_chart_region(self, image: NDArray[np.uint8]) -> BoundingBox | None:
        """Detect the main chart region in the image.

        Uses edge detection and contour analysis to find chart boundaries.

        Args:
            image: Input image.

        Returns:
            BoundingBox of chart region, or None if not detected.
        """
        # Convert to grayscale for edge detection
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) > 2 else image

        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # Edge detection
        edges = cv2.Canny(blurred, 50, 150)

        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return None

        # Find largest contour by area (likely the chart)
        largest_contour = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(largest_contour)

        # Apply padding
        pad = self.config.chart_padding
        height, width = image.shape[:2]
        x = max(0, x - pad)
        y = max(0, y - pad)
        w = min(width - x, w + 2 * pad)
        h = min(height - y, h + 2 * pad)

        # Only return if detected region is significant (>25% of image)
        if w * h > 0.25 * width * height:
            return BoundingBox(x=x, y=y, width=w, height=h)

        return None

    def _crop_to_region(self, image: NDArray[np.uint8], region: BoundingBox) -> NDArray[np.uint8]:
        """Crop image to specified region.

        Args:
            image: Input image.
            region: Region to crop to.

        Returns:
            Cropped image.
        """
        return image[region.y : region.y2, region.x : region.x2]

    def _normalize_brightness(self, image: NDArray[np.uint8]) -> NDArray[np.uint8]:
        """Normalize image brightness to target level.

        Args:
            image: Input image.

        Returns:
            Brightness-normalized image.
        """
        # Calculate current mean brightness
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) > 2 else image

        current_brightness = float(np.mean(gray)) / 255.0  # type: ignore[arg-type]
        target = self.config.target_brightness

        if current_brightness == 0:
            return image

        # Calculate adjustment factor
        factor = target / current_brightness

        # Adjust brightness
        adjusted = np.clip(image.astype(np.float32) * factor, 0, 255)
        return adjusted.astype(np.uint8)

    def _enhance_contrast(self, image: NDArray[np.uint8]) -> NDArray[np.uint8]:
        """Enhance image contrast using CLAHE.

        Args:
            image: Input image.

        Returns:
            Contrast-enhanced image.
        """
        # Create CLAHE object
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

        if len(image.shape) > 2:
            # Convert to LAB color space for better contrast enhancement
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            lab_planes = list(cv2.split(lab))
            lab_planes[0] = clahe.apply(lab_planes[0])
            lab = cv2.merge(lab_planes)
            return cast(NDArray[np.uint8], cv2.cvtColor(lab, cv2.COLOR_LAB2BGR))

        return cast(NDArray[np.uint8], clahe.apply(image))

    def _resize(self, image: NDArray[np.uint8]) -> NDArray[np.uint8]:
        """Resize image to target dimensions.

        Args:
            image: Input image.

        Returns:
            Resized image.
        """
        height, width = image.shape[:2]
        target_w = self.config.target_width
        target_h = self.config.target_height

        if self.config.maintain_aspect_ratio:
            # Calculate scale factor to fit within target dimensions
            scale_w = target_w / width
            scale_h = target_h / height
            scale = min(scale_w, scale_h)

            new_w = int(width * scale)
            new_h = int(height * scale)
        else:
            new_w = target_w
            new_h = target_h

        return cast(
            NDArray[np.uint8], cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        )


def load_image(path: str) -> NDArray[np.uint8]:
    """Load an image from file.

    Args:
        path: Path to image file.

    Returns:
        Image as numpy array.

    Raises:
        FileNotFoundError: If image file doesn't exist.
        ValueError: If image cannot be loaded.
    """
    image = cv2.imread(path)
    if image is None:
        raise ValueError(f"Could not load image from: {path}")
    return cast(NDArray[np.uint8], image)


def load_image_from_bytes(data: bytes) -> NDArray[np.uint8]:
    """Load an image from bytes.

    Args:
        data: Image data as bytes.

    Returns:
        Image as numpy array.

    Raises:
        ValueError: If image cannot be decoded.
    """
    nparr = np.frombuffer(data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image from bytes")
    return cast(NDArray[np.uint8], image)
