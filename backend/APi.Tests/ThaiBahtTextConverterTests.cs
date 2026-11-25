namespace APi.Tests;

public class ThaiBahtTextConverterTests
{
    [Theory]
    [InlineData(0, "ศูนย์บาทถ้วน")]
    [InlineData(1, "หนึ่งบาทถ้วน")]
    [InlineData(10, "สิบบาทถ้วน")]
    [InlineData(11, "สิบเอ็ดบาทถ้วน")]
    [InlineData(20, "ยี่สิบบาทถ้วน")]
    [InlineData(21, "ยี่สิบเอ็ดบาทถ้วน")]
    [InlineData(101, "หนึ่งร้อยเอ็ดบาทถ้วน")]
    [InlineData(2530, "สองพันห้าร้อยสามสิบบาทถ้วน")]
    [InlineData(100000, "หนึ่งแสนบาทถ้วน")]
    [InlineData(1000000, "หนึ่งล้านบาทถ้วน")]
    [InlineData(1000001, "หนึ่งล้านเอ็ดบาทถ้วน")]
    [InlineData(10000000, "สิบล้านบาทถ้วน")]
    [InlineData(21000000, "ยี่สิบเอ็ดล้านบาทถ้วน")]
    [InlineData(123456789, "หนึ่งร้อยยี่สิบสามล้านสี่แสนห้าหมื่นหกพันเจ็ดร้อยแปดสิบเก้าบาทถ้วน")]
    public void Baht_only(int amount, string expected) =>
        Assert.Equal(expected, ThaiBahtTextConverter.ToThaiBahtText(amount));

    [Theory]
    [InlineData("2530.50", "สองพันห้าร้อยสามสิบบาทห้าสิบสตางค์")]
    [InlineData("1.01", "หนึ่งบาทหนึ่งสตางค์")]
    [InlineData("1.21", "หนึ่งบาทยี่สิบเอ็ดสตางค์")]
    [InlineData("0.75", "เจ็ดสิบห้าสตางค์")]
    public void With_satang(string amount, string expected) =>
        Assert.Equal(expected, ThaiBahtTextConverter.ToThaiBahtText(decimal.Parse(amount)));
}
