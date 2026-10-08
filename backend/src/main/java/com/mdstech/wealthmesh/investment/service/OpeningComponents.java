package com.mdstech.wealthmesh.investment.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.investment.dto.HoldingLine;
import com.mdstech.wealthmesh.investment.dto.HoldingRequest;
import com.mdstech.wealthmesh.investment.dto.OpeningPreview;
import com.mdstech.wealthmesh.investment.dto.OpeningRequest;
import com.mdstech.wealthmesh.money.Money;

/**
 * The opening components of an investment account, parsed and judged (V2_*_002, 005, 006). Balance is cash plus the
 * value of each holding line (quantity x price to the cent); the typed total is only a check, and a missing cash is
 * never inferred from it. Pure: no database, so a preview, a create and a finish judge the same way.
 */
public record OpeningComponents(BigDecimal total, BigDecimal cash, List<Line> lines, boolean blank) {

    /** One parsed holding line; `value` is quantity x price rounded to the cent. */
    public record Line(String symbol, BigDecimal quantity, BigDecimal price, LocalDate valueOn) {

        public BigDecimal value() {
            return quantity.multiply(price).setScale(2, RoundingMode.HALF_UP);
        }
    }

    /** What the components allow: a complete account, a draft that waits for cash, or a refused mismatch. */
    public enum State {
        COMPLETE, DRAFT, MISMATCH
    }

    private static final Pattern QUANTITY = Pattern.compile("\\d{1,13}(\\.\\d{1,6})?");
    private static final Pattern PRICE = Pattern.compile("-?\\d{1,15}(\\.\\d{1,4})?");
    private static final int MAX_LINES = 100;
    /** The account's opening amount is NUMERIC(19, 2); stay far inside it. */
    private static final BigDecimal LARGEST = new BigDecimal("999999999999999.99");

    /**
     * Parses and validates. `setupOn` is the tracking start (the account's opened-on date) and `today` the clock's:
     * a holding's value date after today is refused first, then one before the start.
     */
    public static OpeningComponents parse(OpeningRequest request, LocalDate setupOn, LocalDate today) {
        if (request == null) {
            return new OpeningComponents(null, BigDecimal.ZERO.setScale(2), List.of(), true);
        }
        BigDecimal total = amount(request.total(), "Opening total must be zero or greater");
        BigDecimal cash = amount(request.cash(), "Cash must be zero or greater");
        List<HoldingRequest> requested = request.holdings() == null ? List.of() : request.holdings();
        if (requested.size() > MAX_LINES) {
            throw bad("Enter at most " + MAX_LINES + " holdings");
        }
        List<Line> lines = new ArrayList<>();
        for (HoldingRequest holding : requested) {
            lines.add(line(holding, setupOn, today));
        }
        requireStorable(total, cash, lines);
        boolean blank = total == null && cash == null && lines.isEmpty();
        return new OpeningComponents(total, blank ? BigDecimal.ZERO.setScale(2) : cash, List.copyOf(lines), blank);
    }

    private static void requireStorable(BigDecimal total, BigDecimal cash, List<Line> lines) {
        BigDecimal held = lines.stream().map(Line::value).reduce(cash == null ? BigDecimal.ZERO : cash,
                BigDecimal::add);
        if (held.compareTo(LARGEST) > 0 || total != null && total.compareTo(LARGEST) > 0) {
            throw bad("That amount is too large to record");
        }
    }

    private static BigDecimal amount(Object value, String negativeMessage) {
        if (value == null || value instanceof String text && text.isBlank()) {
            return null;
        }
        if (!(value instanceof String text)) {
            throw bad("Enter a valid amount");
        }
        BigDecimal parsed = Money.parse(text).orElseThrow(() -> bad("Enter a valid amount"));
        if (parsed.signum() < 0) {
            throw bad(negativeMessage);
        }
        return parsed;
    }

    private static Line line(HoldingRequest holding, LocalDate setupOn, LocalDate today) {
        String symbol = holding == null || holding.symbol() == null ? "" : holding.symbol().strip();
        if (symbol.isEmpty()) {
            throw bad("Enter the holding's name or symbol");
        }
        if (symbol.length() > 120) {
            throw bad("A holding's name or symbol must be 120 characters or fewer");
        }
        Line line = new Line(symbol, quantity(holding.quantity()), price(holding.price()),
                valueDate(holding.valueOn(), setupOn, today));
        if (line.value().compareTo(LARGEST) > 0) {
            throw bad("That amount is too large to record");
        }
        return line;
    }

    private static BigDecimal quantity(Object value) {
        if (!(value instanceof String text) || !QUANTITY.matcher(text.strip().replaceFirst("^-", "")).matches()) {
            throw bad("Enter a valid number of shares");
        }
        BigDecimal quantity = new BigDecimal(text.strip());
        if (quantity.signum() <= 0) {
            throw bad("Enter more than zero shares");
        }
        return quantity;
    }

    private static BigDecimal price(Object value) {
        if (!(value instanceof String text) || !PRICE.matcher(text.strip()).matches()) {
            throw bad("Enter a valid amount");
        }
        BigDecimal price = new BigDecimal(text.strip());
        if (price.signum() < 0) {
            throw bad("Holding market price must be zero or greater");
        }
        return price;
    }

    /** A holding's value date defaults to the setup date; not after today, not before the tracking start. */
    private static LocalDate valueDate(LocalDate valueOn, LocalDate setupOn, LocalDate today) {
        LocalDate date = valueOn == null ? setupOn : valueOn;
        if (date.isAfter(today)) {
            throw bad("Future values are not completed account history");
        }
        if (date.isBefore(setupOn)) {
            throw bad("Review the earlier tracking start before saving. The Setup date is " + setupOn + ".");
        }
        return date;
    }

    /** Quantity x price of every line, to the cent each. */
    public BigDecimal holdingsValue() {
        return lines.stream().map(Line::value).reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
    }

    /** Cash plus holdings, or null while cash is unanswered. */
    public BigDecimal calculatedBalance() {
        return cash == null ? null : cash.add(holdingsValue());
    }

    public State state() {
        if (cash == null) {
            return State.DRAFT;
        }
        return total != null && total.compareTo(calculatedBalance()) != 0 ? State.MISMATCH : State.COMPLETE;
    }

    /** The mismatch sentence: what the review shows and what a save is refused with. */
    public String mismatchMessage() {
        return "The opening total " + Money.dollars(total) + " does not match cash plus holdings "
                + Money.dollars(calculatedBalance()) + ". Correct the components or the opening total; "
                + "no difference becomes cash.";
    }

    /** The review of these components. */
    public OpeningPreview preview() {
        State state = state();
        List<HoldingLine> shown = lines.stream().map(OpeningComponents::shown).toList();
        BigDecimal balance = calculatedBalance();
        return new OpeningPreview(state.name().toLowerCase(java.util.Locale.ROOT), state != State.MISMATCH,
                cash == null ? null : Money.format(cash), Money.format(holdingsValue()),
                balance == null ? null : Money.format(balance), total == null ? null : Money.format(total),
                total == null || balance == null ? null : Money.format(total.subtract(balance).abs()),
                state == State.DRAFT ? List.of("cash") : List.of(),
                message(state), shown);
    }

    private String message(State state) {
        if (state == State.DRAFT) {
            return "Enter the opening cash. " + (total == null ? "" : "It is not worked out from the total, so ")
                    + (total == null ? "This account" : "this account") + " stays a draft and adds nothing to "
                    + "household wealth.";
        }
        return state == State.MISMATCH ? mismatchMessage() : null;
    }

    public static HoldingLine shown(Line line) {
        return new HoldingLine(line.symbol(), line.quantity().stripTrailingZeros().toPlainString(),
                priceText(line.price()),
                Money.format(line.value()), line.valueOn());
    }

    /** A price keeps at least two decimals and at most four: "100.00", "12.3456". */
    public static String priceText(BigDecimal price) {
        BigDecimal trimmed = price.stripTrailingZeros();
        return (trimmed.scale() < 2 ? trimmed.setScale(2) : trimmed).toPlainString();
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
