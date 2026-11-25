public static class ThaiBahtTextConverter
{
    private static readonly string[] NumberText =
    {
        "ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่",
        "ห้า", "หก", "เจ็ด", "แปด", "เก้า"
    };

    private static readonly string[] PositionText =
    {
        "", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"
    };

    public static string ToThaiBahtText(decimal amount)
    {
        if (amount == 0)
            return "ศูนย์บาทถ้วน";

        string[] parts = amount.ToString("0.00").Split('.');
        string baht = ConvertInteger(parts[0].TrimStart('0'));
        string satang = ConvertInteger(parts[1].TrimStart('0'));

        if (satang == "")
            return baht + "บาทถ้วน";

        return (baht == "" ? "" : baht + "บาท") + satang + "สตางค์";
    }

    private static string ConvertInteger(string number, bool hasMillions = false)
    {
        if (number == "" || number == "0")
            return "";

        // เกินหกหลัก: ส่วนหน้าเป็นจำนวนล้าน (รองรับ ล้านล้าน ด้วยการเรียกซ้ำ)
        if (number.Length > 6)
            return ConvertInteger(number[..^6].TrimStart('0')) + "ล้าน" + ConvertInteger(number[^6..].TrimStart('0'), hasMillions: true);

        string result = "";
        int len = number.Length;

        for (int i = 0; i < len; i++)
        {
            int digit = number[i] - '0';
            int pos = len - i - 1;

            if (digit == 0)
                continue;

            if (pos == 0)
                result += digit == 1 && (len > 1 || hasMillions) ? "เอ็ด" : NumberText[digit];
            else if (pos == 1)
                result += digit == 1 ? "สิบ" : digit == 2 ? "ยี่สิบ" : NumberText[digit] + "สิบ";
            else
                result += NumberText[digit] + PositionText[pos];
        }

        return result;
    }
}
