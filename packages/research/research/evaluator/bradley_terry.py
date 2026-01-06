"""
Bradley-Terry Reward Model for Preference Learning

Implements a neural network-based reward model trained on pairwise preferences
using the Bradley-Terry model. Used to evaluate trading plan quality based on
learned preferences from historical outcomes.

The Bradley-Terry model assumes that the probability of preferring plan A over
plan B follows a logistic function:

    P(A > B) = σ(r(A) - r(B))

where r(·) is the reward function (neural network) and σ is the sigmoid function.

Architecture:
    - Input: 128-dimensional feature vector (plan embeddings)
    - Hidden: [256, 128] with GELU activations
    - Output: Scalar reward value
    - Regularization: LayerNorm, Dropout

Example:
    import torch
    from research.evaluator.bradley_terry import BradleyTerryRewardModel

    # Initialize model
    model = BradleyTerryRewardModel(
        input_dim=128,
        hidden_dims=[256, 128],
        dropout=0.1
    )

    # Training with preference pairs
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)

    # Chosen plan has better outcome than rejected plan
    chosen_features = torch.randn(32, 128)    # Batch of 32 plans
    rejected_features = torch.randn(32, 128)
    margins = torch.ones(32) * 0.5            # Preference strength

    loss = model.compute_preference_loss(chosen_features, rejected_features, margins)
    loss.backward()
    optimizer.step()

    # Prediction
    plan_features = torch.randn(1, 128)
    reward = model.predict_reward(plan_features)
    print(f"Predicted reward: {reward.item():.4f}")
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import torch
import torch.nn as nn
import torch.nn.functional as F

if TYPE_CHECKING:
    from torch import Tensor


class BradleyTerryRewardModel(nn.Module):
    """
    Neural network reward model for preference learning.

    Implements the Bradley-Terry model for learning from pairwise preferences.
    Given two plans A and B where A is preferred, the model learns to assign
    higher reward scores to A than B.

    The loss function is the negative log-likelihood of the Bradley-Terry model:
        L = -log P(A > B) = -log σ(r(A) - r(B) + margin)

    where margin represents the strength of the preference (higher margin = stronger).

    Attributes:
        input_dim: Dimension of input feature vectors
        hidden_dims: List of hidden layer dimensions
        dropout: Dropout probability for regularization
    """

    def __init__(
        self,
        input_dim: int = 128,
        hidden_dims: list[int] | None = None,
        dropout: float = 0.1,
    ) -> None:
        """
        Initialize Bradley-Terry reward model.

        Args:
            input_dim: Dimension of input feature vectors (default: 128)
            hidden_dims: List of hidden layer dimensions (default: [256, 128])
            dropout: Dropout probability (default: 0.1)

        Raises:
            ValueError: If input_dim <= 0 or dropout not in [0, 1)
        """
        super().__init__()

        if input_dim <= 0:
            raise ValueError(f"input_dim must be positive, got {input_dim}")
        if not 0 <= dropout < 1:
            raise ValueError(f"dropout must be in [0, 1), got {dropout}")

        self.input_dim = input_dim
        self.hidden_dims = hidden_dims or [256, 128]
        self.dropout = dropout

        # Build network layers
        layers: list[nn.Module] = []
        prev_dim = input_dim

        for hidden_dim in self.hidden_dims:
            # Linear layer
            layers.append(nn.Linear(prev_dim, hidden_dim))
            # Layer normalization for training stability
            layers.append(nn.LayerNorm(hidden_dim))
            # GELU activation (smooth, differentiable)
            layers.append(nn.GELU())
            # Dropout for regularization
            layers.append(nn.Dropout(dropout))
            prev_dim = hidden_dim

        # Output layer: scalar reward
        layers.append(nn.Linear(prev_dim, 1))

        self.network = nn.Sequential(*layers)

        # Initialize weights using Xavier/Glorot initialization
        self._initialize_weights()

    def _initialize_weights(self) -> None:
        """Initialize network weights for stable training."""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(self, features: Tensor) -> Tensor:
        """
        Forward pass through the reward model.

        Args:
            features: Input feature tensor of shape (batch_size, input_dim)

        Returns:
            Reward scores of shape (batch_size, 1)

        Raises:
            ValueError: If input shape is invalid
        """
        if features.dim() != 2:
            raise ValueError(f"Expected 2D input tensor, got shape {features.shape}")
        if features.size(1) != self.input_dim:
            raise ValueError(f"Expected input_dim={self.input_dim}, got {features.size(1)}")

        return self.network(features)

    def compute_preference_loss(
        self,
        chosen_features: Tensor,
        rejected_features: Tensor,
        margins: Tensor | None = None,
    ) -> Tensor:
        """
        Compute Bradley-Terry preference learning loss.

        The loss encourages the model to assign higher rewards to chosen plans
        than rejected plans, with the margin controlling preference strength.

        Loss = -log P(chosen > rejected)
             = -log σ(r(chosen) - r(rejected) + margin)
             = log(1 + exp(-(r(chosen) - r(rejected) + margin)))

        Args:
            chosen_features: Features of preferred plans (batch_size, input_dim)
            rejected_features: Features of rejected plans (batch_size, input_dim)
            margins: Optional preference strength per pair (batch_size,)
                    Higher margins = stronger preferences
                    Default: 0.0 (neutral)

        Returns:
            Scalar loss value (mean over batch)

        Raises:
            ValueError: If input shapes don't match
        """
        if chosen_features.shape != rejected_features.shape:
            raise ValueError(
                f"Shape mismatch: chosen {chosen_features.shape} vs "
                f"rejected {rejected_features.shape}"
            )

        batch_size = chosen_features.size(0)

        # Default margins to zero if not provided
        if margins is None:
            margins = torch.zeros(batch_size, device=chosen_features.device)
        else:
            if margins.size(0) != batch_size:
                raise ValueError(
                    f"margins batch size {margins.size(0)} doesn't match "
                    f"features batch size {batch_size}"
                )
            # Ensure margins is 1D
            if margins.dim() != 1:
                margins = margins.squeeze()

        # Compute rewards for chosen and rejected plans
        chosen_rewards = self.forward(chosen_features).squeeze(-1)  # (batch_size,)
        rejected_rewards = self.forward(rejected_features).squeeze(-1)  # (batch_size,)

        # Reward difference with margin
        # Higher margin = more confident that chosen > rejected
        reward_diff = chosen_rewards - rejected_rewards + margins

        # Bradley-Terry loss: -log P(chosen > rejected)
        # Using log_sigmoid for numerical stability
        # -log σ(x) = log(1 + exp(-x)) = -log_sigmoid(x)
        loss = -F.logsigmoid(reward_diff)

        # Return mean loss over batch
        return loss.mean()

    def predict_reward(self, features: Tensor) -> Tensor:
        """
        Predict reward for a set of plans.

        Args:
            features: Plan features (batch_size, input_dim) or (input_dim,)

        Returns:
            Reward scores (batch_size,) or scalar if input was 1D

        Raises:
            ValueError: If input shape is invalid
        """
        # Handle single feature vector
        squeeze_output = False
        if features.dim() == 1:
            features = features.unsqueeze(0)
            squeeze_output = True

        # Forward pass
        rewards = self.forward(features).squeeze(-1)

        # Return scalar if input was 1D
        if squeeze_output:
            rewards = rewards.squeeze(0)

        return rewards

    def predict_preference(
        self,
        features_a: Tensor,
        features_b: Tensor,
    ) -> Tensor:
        """
        Predict probability that plan A is preferred over plan B.

        Uses the Bradley-Terry model:
            P(A > B) = σ(r(A) - r(B))

        Args:
            features_a: Features for plan A (batch_size, input_dim)
            features_b: Features for plan B (batch_size, input_dim)

        Returns:
            Probabilities P(A > B) in range [0, 1] (batch_size,)

        Raises:
            ValueError: If input shapes don't match
        """
        if features_a.shape != features_b.shape:
            raise ValueError(
                f"Shape mismatch: features_a {features_a.shape} vs features_b {features_b.shape}"
            )

        # Compute rewards
        rewards_a = self.predict_reward(features_a)
        rewards_b = self.predict_reward(features_b)

        # Apply sigmoid to reward difference
        preference_prob = torch.sigmoid(rewards_a - rewards_b)

        return preference_prob

    def training_step(
        self,
        chosen_features: Tensor,
        rejected_features: Tensor,
        margins: Tensor | None = None,
        optimizer: torch.optim.Optimizer | None = None,
    ) -> float:
        """
        Perform a single training step.

        Convenience method that computes loss, performs backprop, and
        updates weights.

        Args:
            chosen_features: Features of preferred plans
            rejected_features: Features of rejected plans
            margins: Optional preference margins
            optimizer: Optimizer to use (must be provided)

        Returns:
            Loss value as float

        Raises:
            ValueError: If optimizer is None
        """
        if optimizer is None:
            raise ValueError("optimizer must be provided for training_step")

        # Set to training mode
        self.train()

        # Zero gradients
        optimizer.zero_grad()

        # Compute loss
        loss = self.compute_preference_loss(chosen_features, rejected_features, margins)

        # Backward pass
        loss.backward()

        # Update weights
        optimizer.step()

        return loss.item()

    def save_checkpoint(self, path: str) -> None:
        """
        Save model checkpoint.

        Args:
            path: Path to save checkpoint file
        """
        checkpoint = {
            "model_state_dict": self.state_dict(),
            "input_dim": self.input_dim,
            "hidden_dims": self.hidden_dims,
            "dropout": self.dropout,
        }
        torch.save(checkpoint, path)

    @classmethod
    def load_checkpoint(cls, path: str, device: str = "cpu") -> BradleyTerryRewardModel:
        """
        Load model from checkpoint.

        Args:
            path: Path to checkpoint file
            device: Device to load model on ('cpu' or 'cuda')

        Returns:
            Loaded model
        """
        checkpoint = torch.load(path, map_location=device, weights_only=True)

        # Recreate model with saved hyperparameters
        model = cls(
            input_dim=checkpoint["input_dim"],
            hidden_dims=checkpoint["hidden_dims"],
            dropout=checkpoint["dropout"],
        )

        # Load state dict
        model.load_state_dict(checkpoint["model_state_dict"])

        return model


def train_bradley_terry_model(
    model: BradleyTerryRewardModel,
    chosen_features: Tensor,
    rejected_features: Tensor,
    margins: Tensor | None = None,
    learning_rate: float = 1e-4,
    num_epochs: int = 10,
    batch_size: int = 32,
    device: str = "cpu",
    verbose: bool = True,
) -> list[float]:
    """
    Train Bradley-Terry model on preference data.

    Args:
        model: Model to train
        chosen_features: All chosen plan features (N, input_dim)
        rejected_features: All rejected plan features (N, input_dim)
        margins: Optional preference margins (N,)
        learning_rate: Learning rate for Adam optimizer
        num_epochs: Number of training epochs
        batch_size: Batch size for training
        device: Device to train on ('cpu' or 'cuda')
        verbose: Whether to print progress

    Returns:
        List of loss values per epoch

    Raises:
        ValueError: If input shapes are invalid
    """
    if chosen_features.shape[0] != rejected_features.shape[0]:
        raise ValueError("chosen_features and rejected_features must have same length")

    if margins is not None and margins.size(0) != chosen_features.size(0):
        raise ValueError("margins must have same length as features")

    # Move model and data to device
    model = model.to(device)
    chosen_features = chosen_features.to(device)
    rejected_features = rejected_features.to(device)
    if margins is not None:
        margins = margins.to(device)

    # Create optimizer
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    # Training loop
    num_samples = chosen_features.size(0)
    epoch_losses: list[float] = []

    for epoch in range(num_epochs):
        model.train()
        epoch_loss = 0.0
        num_batches = 0

        # Create random permutation for this epoch
        indices = torch.randperm(num_samples)

        # Iterate over batches
        for i in range(0, num_samples, batch_size):
            batch_indices = indices[i : i + batch_size]

            # Get batch data
            chosen_batch = chosen_features[batch_indices]
            rejected_batch = rejected_features[batch_indices]
            margins_batch = margins[batch_indices] if margins is not None else None

            # Training step
            loss = model.training_step(chosen_batch, rejected_batch, margins_batch, optimizer)

            epoch_loss += loss
            num_batches += 1

        # Average loss for epoch
        avg_loss = epoch_loss / num_batches
        epoch_losses.append(avg_loss)

        if verbose:
            print(f"Epoch {epoch + 1}/{num_epochs}, Loss: {avg_loss:.4f}")

    return epoch_losses
