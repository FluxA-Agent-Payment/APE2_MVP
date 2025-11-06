use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("AnZDD6eXMV3xfhLqXWi6DUp8ebJwYCYfce8sYawVgdan");

/// AEP2 Debit Wallet Program
/// Manages user funds with delayed withdrawals and one-time payment settlement
#[program]
pub mod aep2_debit_wallet {
    use super::*;

    /// Initialize the debit wallet program
    pub fn initialize(ctx: Context<Initialize>, withdraw_delay: i64) -> Result<()> {
        let wallet_state = &mut ctx.accounts.wallet_state;
        wallet_state.authority = ctx.accounts.authority.key();
        wallet_state.withdraw_delay = withdraw_delay;
        wallet_state.bump = ctx.bumps.wallet_state;
        Ok(())
    }

    /// Deposit SPL tokens into the debit wallet
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // Transfer tokens from user to wallet PDA
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.wallet_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Update user balance
        let user_account = &mut ctx.accounts.user_account;
        user_account.balance = user_account.balance.checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;

        emit!(Deposited {
            user: ctx.accounts.user.key(),
            token: ctx.accounts.mint.key(),
            amount,
        });

        Ok(())
    }

    /// Request withdrawal (enters lock period)
    pub fn request_withdraw(ctx: Context<RequestWithdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        let user_account = &mut ctx.accounts.user_account;
        let wallet_state = &ctx.accounts.wallet_state;

        require!(
            user_account.balance >= amount,
            ErrorCode::InsufficientBalance
        );
        require!(
            user_account.withdraw_lock.locked == 0,
            ErrorCode::WithdrawalPending
        );

        // Lock the amount for withdrawal
        user_account.balance = user_account.balance.checked_sub(amount)
            .ok_or(ErrorCode::Underflow)?;
        
        let clock = Clock::get()?;
        user_account.withdraw_lock.locked = amount;
        user_account.withdraw_lock.unlock_at = clock.unix_timestamp + wallet_state.withdraw_delay;

        emit!(WithdrawalRequested {
            user: ctx.accounts.user.key(),
            token: ctx.accounts.mint.key(),
            amount,
            unlock_at: user_account.withdraw_lock.unlock_at,
        });

        Ok(())
    }

    /// Execute withdrawal after delay
    pub fn execute_withdraw(ctx: Context<ExecuteWithdraw>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let wallet_state = &ctx.accounts.wallet_state;

        require!(
            user_account.withdraw_lock.locked > 0,
            ErrorCode::NoWithdrawalPending
        );

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= user_account.withdraw_lock.unlock_at,
            ErrorCode::WithdrawalNotReady
        );

        let amount = user_account.withdraw_lock.locked;

        // Transfer tokens from wallet PDA to user
        let seeds = &[
            b"wallet_state".as_ref(),
            &[wallet_state.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.wallet_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: wallet_state.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        // Clear withdrawal lock
        user_account.withdraw_lock.locked = 0;
        user_account.withdraw_lock.unlock_at = 0;

        emit!(WithdrawalExecuted {
            user: ctx.accounts.user.key(),
            token: ctx.accounts.mint.key(),
            amount,
        });

        Ok(())
    }

    /// Settle a payment using a signed mandate
    pub fn settle(
        ctx: Context<Settle>,
        amount: u64,
        nonce: u64,
        deadline: i64,
        reference: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= deadline, ErrorCode::MandateExpired);

        let user_account = &mut ctx.accounts.payer_account;
        let wallet_state = &ctx.accounts.wallet_state;

        // Check nonce not used
        require!(!user_account.is_nonce_used(nonce), ErrorCode::NonceUsed);

        // Check sufficient balance
        require!(
            user_account.balance >= amount,
            ErrorCode::InsufficientBalance
        );

        // Mark nonce as used
        user_account.mark_nonce_used(nonce)?;

        // Deduct balance
        user_account.balance = user_account.balance.checked_sub(amount)
            .ok_or(ErrorCode::Underflow)?;

        // Transfer tokens from wallet PDA to payee
        let seeds = &[
            b"wallet_state".as_ref(),
            &[wallet_state.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.wallet_token_account.to_account_info(),
            to: ctx.accounts.payee_token_account.to_account_info(),
            authority: wallet_state.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        emit!(Settled {
            payer: ctx.accounts.payer.key(),
            token: ctx.accounts.mint.key(),
            payee: ctx.accounts.payee.key(),
            amount,
            nonce,
            reference,
        });

        Ok(())
    }

    /// Set or revoke SP authorization
    pub fn set_sp(ctx: Context<SetSP>, enabled: bool) -> Result<()> {
        let sp_account = &mut ctx.accounts.sp_account;
        sp_account.sp = ctx.accounts.sp.key();
        sp_account.enabled = enabled;
        sp_account.bump = ctx.bumps.sp_account;

        emit!(SPSet {
            sp: ctx.accounts.sp.key(),
            enabled,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + WalletState::INIT_SPACE,
        seeds = [b"wallet_state"],
        bump
    )]
    pub wallet_state: Account<'info, WalletState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserAccount::INIT_SPACE,
        seeds = [b"user_account", user.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = wallet_token_account.mint == mint.key(),
    )]
    pub wallet_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, token::Mint>,
    pub wallet_state: Account<'info, WalletState>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user_account", user.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    pub mint: Account<'info, token::Mint>,
    pub wallet_state: Account<'info, WalletState>,
}

#[derive(Accounts)]
pub struct ExecuteWithdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user_account", user.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = wallet_token_account.mint == mint.key(),
    )]
    pub wallet_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, token::Mint>,
    pub wallet_state: Account<'info, WalletState>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        constraint = sp_account.enabled == true @ ErrorCode::NotAuthorizedSP,
        constraint = sp_account.sp == sp.key(),
    )]
    pub sp_account: Account<'info, SPAccount>,

    pub sp: Signer<'info>,

    /// CHECK: Payer pubkey, verified through user_account PDA
    pub payer: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"user_account", payer.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub payer_account: Account<'info, UserAccount>,

    /// CHECK: Payee pubkey, constraint checked via token account
    pub payee: AccountInfo<'info>,

    #[account(
        mut,
        constraint = payee_token_account.owner == payee.key(),
        constraint = payee_token_account.mint == mint.key(),
    )]
    pub payee_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = wallet_token_account.mint == mint.key(),
    )]
    pub wallet_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, token::Mint>,
    pub wallet_state: Account<'info, WalletState>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetSP<'info> {
    #[account(
        mut,
        constraint = wallet_state.authority == authority.key() @ ErrorCode::NotAuthorized
    )]
    pub wallet_state: Account<'info, WalletState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: SP pubkey to authorize
    pub sp: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + SPAccount::INIT_SPACE,
        seeds = [b"sp_account", sp.key().as_ref()],
        bump
    )]
    pub sp_account: Account<'info, SPAccount>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct WalletState {
    pub authority: Pubkey,
    pub withdraw_delay: i64, // Delay in seconds (default: 3 hours = 10800)
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    pub balance: u64,
    pub withdraw_lock: WithdrawLock,
    #[max_len(100)]
    pub used_nonces: Vec<u64>, // Store last 100 nonces for replay protection
}

impl UserAccount {
    pub fn is_nonce_used(&self, nonce: u64) -> bool {
        self.used_nonces.contains(&nonce)
    }

    pub fn mark_nonce_used(&mut self, nonce: u64) -> Result<()> {
        if self.used_nonces.len() >= 100 {
            self.used_nonces.remove(0);
        }
        self.used_nonces.push(nonce);
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct WithdrawLock {
    pub locked: u64,
    pub unlock_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct SPAccount {
    pub sp: Pubkey,
    pub enabled: bool,
    pub bump: u8,
}

// Events
#[event]
pub struct Deposited {
    pub user: Pubkey,
    pub token: Pubkey,
    pub amount: u64,
}

#[event]
pub struct WithdrawalRequested {
    pub user: Pubkey,
    pub token: Pubkey,
    pub amount: u64,
    pub unlock_at: i64,
}

#[event]
pub struct WithdrawalExecuted {
    pub user: Pubkey,
    pub token: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Settled {
    pub payer: Pubkey,
    pub token: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub reference: [u8; 32],
}

#[event]
pub struct SPSet {
    pub sp: Pubkey,
    pub enabled: bool,
}

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than 0")]
    InvalidAmount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Withdrawal already pending")]
    WithdrawalPending,
    #[msg("No withdrawal pending")]
    NoWithdrawalPending,
    #[msg("Withdrawal not ready yet")]
    WithdrawalNotReady,
    #[msg("Mandate has expired")]
    MandateExpired,
    #[msg("Nonce already used")]
    NonceUsed,
    #[msg("Not authorized")]
    NotAuthorized,
    #[msg("Not authorized SP")]
    NotAuthorizedSP,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arithmetic underflow")]
    Underflow,
}

